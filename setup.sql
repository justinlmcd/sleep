-- SLEEP. Run once in your Supabase project (SQL Editor), the same project as your other apps. Safe to run again.
begin;

-- One row per night, synced from Apple Health by the YOU watch app. `night` is the morning you woke up.
create table if not exists public.sleep_nights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  night date not null,
  bedtime timestamptz,
  wake_time timestamptz,
  asleep_min int not null default 0 check (asleep_min between 0 and 1440),
  awake_min int check (awake_min between 0 and 1440),
  core_min int check (core_min between 0 and 1440),
  deep_min int check (deep_min between 0 and 1440),
  rem_min int check (rem_min between 0 and 1440),
  resting_hr numeric check (resting_hr between 20 and 250),
  source text not null default 'watch',
  updated_at timestamptz not null default now(),
  unique (user_id, night)
);
create index if not exists sleep_nights_by_night on public.sleep_nights (user_id, night desc);
alter table public.sleep_nights enable row level security;
drop policy if exists sn_read on public.sleep_nights;
drop policy if exists sn_write on public.sleep_nights;
drop policy if exists sn_edit on public.sleep_nights;
drop policy if exists sn_remove on public.sleep_nights;
create policy sn_read   on public.sleep_nights for select using (user_id = auth.uid());
create policy sn_write  on public.sleep_nights for insert with check (user_id = auth.uid());
create policy sn_edit   on public.sleep_nights for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sn_remove on public.sleep_nights for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.sleep_nights to authenticated;

-- Your sleep goal.
create table if not exists public.sleep_goals (
  user_id uuid primary key default auth.uid(),
  goal_hours numeric not null default 8 check (goal_hours between 4 and 12),
  updated_at timestamptz not null default now()
);
alter table public.sleep_goals enable row level security;
drop policy if exists sg_read on public.sleep_goals;
drop policy if exists sg_write on public.sleep_goals;
drop policy if exists sg_edit on public.sleep_goals;
create policy sg_read  on public.sleep_goals for select using (user_id = auth.uid());
create policy sg_write on public.sleep_goals for insert with check (user_id = auth.uid());
create policy sg_edit  on public.sleep_goals for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.sleep_goals to authenticated;

commit;
