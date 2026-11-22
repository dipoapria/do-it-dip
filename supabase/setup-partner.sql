-- Do it Dip: link two accounts (partners) and send them their part of a shared bill.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
--
-- links: an invitation from one account to an email; the invited account accepts it (accept_link).
-- inbox: items one linked account sends the other ("Kiriman"); the receiver accepts or declines them in the app.
-- Row Level Security: an account only sees its own invitations and the items sent by or to it.

create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_email  text not null,
  from_name   text,
  to_email    text not null,
  to_id       uuid references auth.users (id) on delete cascade,
  to_name     text,
  status      text not null default 'pending' check (status in ('pending', 'active')),
  created_at  timestamptz not null default now()
);
create unique index if not exists links_pair on public.links (from_id, lower(to_email));

create table if not exists public.inbox (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_name   text,
  to_id       uuid not null references auth.users (id) on delete cascade,
  payload     jsonb not null check (octet_length(payload::text) < 30000),
  status      text not null default 'new' check (status in ('new', 'done', 'declined')),
  created_at  timestamptz not null default now()
);

alter table public.links enable row level security;
alter table public.inbox enable row level security;

drop policy if exists "links: see own"      on public.links;
drop policy if exists "links: invite"       on public.links;
drop policy if exists "links: remove own"   on public.links;
drop policy if exists "inbox: see own"      on public.inbox;
drop policy if exists "inbox: send linked"  on public.inbox;
drop policy if exists "inbox: answer own"   on public.inbox;
drop policy if exists "inbox: remove own"   on public.inbox;

create policy "links: see own" on public.links for select to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()) or lower(to_email) = lower((select auth.jwt() ->> 'email')));
create policy "links: invite" on public.links for insert to authenticated
  with check (from_id = (select auth.uid()) and lower(from_email) = lower((select auth.jwt() ->> 'email'))
              and lower(to_email) <> lower((select auth.jwt() ->> 'email')) and status = 'pending' and to_id is null);
create policy "links: remove own" on public.links for delete to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()) or lower(to_email) = lower((select auth.jwt() ->> 'email')));

create policy "inbox: see own" on public.inbox for select to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));
create policy "inbox: send linked" on public.inbox for insert to authenticated
  with check (from_id = (select auth.uid()) and status = 'new' and exists (
    select 1 from public.links l where l.status = 'active'
      and ((l.from_id = (select auth.uid()) and l.to_id = inbox.to_id) or (l.to_id = (select auth.uid()) and l.from_id = inbox.to_id))));
create policy "inbox: answer own" on public.inbox for update to authenticated
  using (to_id = (select auth.uid())) with check (to_id = (select auth.uid()));
create policy "inbox: remove own" on public.inbox for delete to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));

revoke all on public.links from anon;
revoke all on public.inbox from anon;
grant select, insert, delete on public.links to authenticated;
grant select, insert, update, delete on public.inbox to authenticated;

-- Accepting an invitation: only the invited email can, and only these columns change.
create or replace function public.accept_link(link uuid, my_name text) returns void
language sql security definer set search_path = public as $$
  update public.links set status = 'active', to_id = auth.uid(), to_name = my_name
  where id = link and status = 'pending' and lower(to_email) = lower(auth.jwt() ->> 'email');
$$;
revoke all on function public.accept_link(uuid, text) from public, anon;
grant execute on function public.accept_link(uuid, text) to authenticated;
