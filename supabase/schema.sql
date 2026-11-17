-- ElectroLab — cloud projects (Supabase / Postgres).
-- Run once in the Supabase SQL editor. Row-level security makes the database enforce access:
-- owners read and write their own projects; anyone can read projects marked as public.

create table if not exists public.projects (
  id          uuid primary key,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  doc         jsonb not null check (jsonb_typeof(doc) = 'object'),
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx on public.projects (owner, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "owner reads own projects" on public.projects;
create policy "owner reads own projects" on public.projects
  for select using (auth.uid() = owner);

drop policy if exists "public projects are readable by anyone" on public.projects;
create policy "public projects are readable by anyone" on public.projects
  for select using (is_public);

drop policy if exists "owner inserts own projects" on public.projects;
create policy "owner inserts own projects" on public.projects
  for insert with check (auth.uid() = owner);

drop policy if exists "owner updates own projects" on public.projects;
create policy "owner updates own projects" on public.projects
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "owner deletes own projects" on public.projects;
create policy "owner deletes own projects" on public.projects
  for delete using (auth.uid() = owner);
