alter table public.move_plans
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists move_plans_owner_id_idx on public.move_plans(owner_id);
