-- Under — run this once in Supabase (SQL Editor → New query → Run).
-- Safe to re-run, and safe to run over the earlier no-login version.

-- ---------- tables ----------
create table if not exists entries (
  id           text primary key,
  household_id text        not null,
  day          date        not null,
  person       text        not null,          -- whose spending it is (H / F / J)
  logged_by    text,                          -- who typed it in
  name         text        not null,
  amount       numeric     not null,
  cat          text        not null,
  kind         text        not null default 'daily',
  deleted      boolean     not null default false,
  updated_at   timestamptz not null default now()
);
alter table entries add column if not exists logged_by text;
create index if not exists entries_household_day on entries (household_id, day);

create table if not exists household (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- one row per signed-in person, tying an account to a household
create table if not exists profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  household_id text not null,
  person_key   text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ---------- which household is the caller in ----------
-- security definer so the lookup itself isn't blocked by RLS
create or replace function current_household() returns text
language sql stable security definer set search_path = public as $$
  select household_id from profiles where user_id = auth.uid()
$$;

-- ---------- row level security ----------
alter table entries   enable row level security;
alter table household enable row level security;
alter table profiles  enable row level security;

-- clear anything from the earlier version
drop policy if exists "under entries"   on entries;
drop policy if exists "under household" on household;
drop policy if exists "entries in my household"   on entries;
drop policy if exists "household settings"        on household;
drop policy if exists "read profiles in my house" on profiles;
drop policy if exists "create my own profile"     on profiles;
drop policy if exists "update my own profile"     on profiles;

-- you only ever see your own household, and only when signed in
create policy "entries in my household" on entries for all to authenticated
  using (household_id = current_household())
  with check (household_id = current_household());

create policy "household settings" on household for all to authenticated
  using (id = current_household())
  with check (id = current_household());

create policy "read profiles in my house" on profiles for select to authenticated
  using (user_id = auth.uid() or household_id = current_household());

create policy "create my own profile" on profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "update my own profile" on profiles for update to authenticated
  using (user_id = auth.uid());

-- ---------- live updates between your phones ----------
do $$
begin
  alter publication supabase_realtime add table entries;
exception when duplicate_object then null;
end $$;
