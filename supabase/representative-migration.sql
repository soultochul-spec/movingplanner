-- 기존 계획/이름/완료 기록은 보존합니다. 과거 session_id를 계정으로 추정하지 않습니다.
begin;
alter table public.plan_members add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists plan_members_account_idx on public.plan_members(plan_id, user_id) where user_id is not null;
alter table public.move_plans add column if not exists representative_id uuid references public.plan_members(id) on delete set null;

-- 서비스 역할만 호출 가능. p_actor는 클라이언트 입력이 아닌 서버에서 검증한 로그인 ID입니다.
-- 계획 행 잠금으로 대표 이양과 삭제의 권한 확인/변경을 하나의 트랜잭션으로 처리합니다.
create or replace function public.manage_plan_member(
  p_actor uuid, p_token text, p_action text,
  p_member_id uuid default null, p_display_name text default null
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_plan public.move_plans%rowtype;
  v_member public.plan_members%rowtype;
  v_representative public.plan_members%rowtype;
begin
  if p_actor is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  select * into v_plan from public.move_plans where share_token = p_token for update;
  if not found then
    raise exception '계획을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if p_action in ('join', 'add') then
    if p_action = 'join' then
      select * into v_member from public.plan_members where plan_id = v_plan.id and user_id = p_actor;
    end if;
    if v_member.id is null then
      if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 20 then
        raise exception '이름은 1~20자로 입력해 주세요.' using errcode = '22023';
      end if;
      insert into public.plan_members(id, plan_id, display_name, session_id, user_id)
      values (gen_random_uuid(), v_plan.id, btrim(p_display_name), gen_random_uuid()::text,
              case when p_action = 'join' then p_actor else null end)
      returning * into v_member;
    end if;
    if p_action = 'join' and v_plan.representative_id is null and v_plan.owner_id = p_actor then
      update public.move_plans set representative_id = v_member.id where id = v_plan.id;
    end if;
    return jsonb_build_object('member', to_jsonb(v_member));
  end if;

  select * into v_member from public.plan_members where id = p_member_id and plan_id = v_plan.id;
  if not found then
    raise exception '이 계획의 참여자를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select * into v_representative from public.plan_members where id = v_plan.representative_id and plan_id = v_plan.id;

  if p_action = 'representative' then
    if not (coalesce(v_representative.user_id = p_actor, false)
            or (v_plan.representative_id is null and coalesce(v_plan.owner_id = p_actor, false))) then
      raise exception '현재 대표만 대표를 변경할 수 있습니다. 대표가 없으면 계획 작성자가 지정합니다.' using errcode = '42501';
    end if;
    if v_member.user_id is null then
      raise exception '본인 계정으로 참여한 사람에게만 대표를 넘길 수 있습니다.' using errcode = '22023';
    end if;
    update public.move_plans set representative_id = v_member.id where id = v_plan.id;
    return jsonb_build_object('representative_id', v_member.id);
  elsif p_action = 'delete' then
    if not coalesce(v_representative.user_id = p_actor, false) then
      raise exception '대표만 참여자를 삭제할 수 있습니다.' using errcode = '42501';
    end if;
    if v_member.id = v_plan.representative_id then
      raise exception '대표를 먼저 다른 참여자에게 넘겨 주세요.' using errcode = '22023';
    end if;
    -- tasks.assignee_id의 ON DELETE SET NULL이 담당자만 해제합니다.
    delete from public.plan_members where id = v_member.id and plan_id = v_plan.id;
    return jsonb_build_object('deleted_id', v_member.id);
  else
    raise exception '지원하지 않는 요청입니다.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.manage_plan_member(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.manage_plan_member(uuid, text, text, uuid, text) to service_role;
notify pgrst, 'reload schema';
commit;
