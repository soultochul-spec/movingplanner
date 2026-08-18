create table public.move_plans (
  id uuid primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  move_date date not null,
  origin text,
  destination text,
  share_token text not null unique,
  created_at timestamptz not null default now()
);

create table public.plan_members (
  id uuid primary key,
  plan_id uuid not null references public.move_plans(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  session_id text not null,
  created_at timestamptz not null default now(),
  unique(plan_id, session_id)
);

create table public.tasks (
  id uuid primary key,
  plan_id uuid not null references public.move_plans(id) on delete cascade,
  title text not null,
  description text,
  category text not null check (category in ('행정','업체/예약','짐 정리','공과금','계약/정산','입주')),
  relative_days integer not null,
  priority text not null check (priority in ('높음','보통','낮음')),
  assignee_id uuid references public.plan_members(id) on delete set null,
  completed boolean not null default false,
  completed_by text,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.move_plans enable row level security;
alter table public.plan_members enable row level security;
alter table public.tasks enable row level security;

-- 브라우저는 테이블에 직접 접근하지 않습니다. 초대 토큰 검증은 Next.js 서버 API가
-- 수행하고, 서버의 service_role만 데이터에 접근합니다.
revoke all on public.move_plans, public.plan_members, public.tasks from anon, authenticated;

create index move_plans_owner_id_idx on public.move_plans(owner_id);
