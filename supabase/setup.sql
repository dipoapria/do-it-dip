-- Do it Dip: online backup table.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- One row per account holding the latest full backup of the app (same format as "Ekspor cadangan").

create table if not exists public.backups (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  tx_count   integer     not null default 0,
  device     text,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every signed-in user can only see and change their own row.
-- The publishable key in the app cannot read anything without signing in.
alter table public.backups enable row level security;

drop policy if exists "backups: read own"   on public.backups;
drop policy if exists "backups: insert own" on public.backups;
drop policy if exists "backups: update own" on public.backups;
drop policy if exists "backups: delete own" on public.backups;

create policy "backups: read own"   on public.backups for select to authenticated using ((select auth.uid()) = user_id);
create policy "backups: insert own" on public.backups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "backups: update own" on public.backups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "backups: delete own" on public.backups for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.backups from anon;
grant select, insert, update, delete on public.backups to authenticated;

-- The server sets the time of every save, so devices can tell which copy is newer.
create or replace function public.backups_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists backups_touch on public.backups;
create trigger backups_touch before insert or update on public.backups for each row execute function public.backups_touch();
