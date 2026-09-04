-- ============================================================
-- Hawker Hunt admin system - PART 2 (tables 8-11 only)
-- Run this in Supabase SQL Editor AFTER admin-system.sql part 1.
-- All comments are ASCII-only to avoid any encoding issue.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 8. spirit_config: per-spirit spawn toggle / weight (admin "Spirits" page)
--    no row = default active, weight 1
create table if not exists public.spirit_config (
  spirit_id    text primary key,
  active       boolean not null default true,
  spawn_weight integer not null default 1 check (spawn_weight between 0 and 10),
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

alter table public.spirit_config enable row level security;

-- 9. centre_config: centre toggle + spawnPool override (admin "Centres" page)
--    spawn_pool null = use centres.ts default; active false = hide on map
create table if not exists public.centre_config (
  centre_id    text primary key,
  active       boolean not null default true,
  spawn_pool   text[],
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

alter table public.centre_config enable row level security;

-- 10. missions: mission CRUD (admin "Missions" page; game reads getActiveMissions)
--     title jsonb = {zh, en}; reward jsonb = {coins, gems, items:{id:qty}}
--     period: 'daily' (resets each day) | 'once' (one-time special)
create table if not exists public.missions (
  id          uuid primary key default gen_random_uuid(),
  title       jsonb not null,
  goal        text not null check (goal in ('capture', 'capture_unique', 'checkin', 'battle_win', 'evolve')),
  target      integer not null default 1,
  reward      jsonb not null default '{}'::jsonb,
  period      text not null default 'daily' check (period in ('daily', 'once')),
  active      boolean not null default true,
  sort        integer not null default 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists missions_active_idx on public.missions (active, sort);

alter table public.missions enable row level security;

-- 11. notifications: in-app notifications (admin "Notifications" page; bell in game)
--     user_id null = broadcast to all; icon = emoji; link = in-app route
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  icon       text,
  link       text,
  user_id    uuid references auth.users (id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

alter table public.notifications enable row level security;

-- Done. Tables use service-role only (no anon policies on purpose).

-- 12. bgm_tracks: admin-uploaded background music (Supabase Storage bucket "bgm")
--     Create a PUBLIC bucket named "bgm" in Dashboard - Storage first.
create table if not exists public.bgm_tracks (
  id           uuid primary key default gen_random_uuid(),
  title        jsonb not null,
  storage_path text not null,
  sort         integer not null default 0,
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists bgm_tracks_active_idx on public.bgm_tracks (active, sort);

alter table public.bgm_tracks enable row level security;
-- no anon policies on purpose; service role only
