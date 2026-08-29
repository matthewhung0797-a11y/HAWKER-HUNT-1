-- Hawker Hunt 排行榜 schema
-- 用法：Supabase Dashboard → SQL Editor → 貼上成個檔案 → Run
-- 之後將 Project Settings → API 嘅 URL 同 anon key 填入 .env.local：
--   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
--   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

create table if not exists public.leaderboard (
  player_key text primary key,
  nickname   text not null default 'Hawker Hunter',
  faction_id text,
  score      integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 按分數排序讀榜用
create index if not exists leaderboard_score_idx on public.leaderboard (score desc);

alter table public.leaderboard enable row level security;

-- MVP 匿名榜：公開讀＋公開寫（正式版接 Supabase Auth 再收緊）
drop policy if exists "public read"   on public.leaderboard;
drop policy if exists "public insert" on public.leaderboard;
drop policy if exists "public update" on public.leaderboard;

create policy "public read"   on public.leaderboard for select using (true);
create policy "public insert" on public.leaderboard for insert with check (true);
create policy "public update" on public.leaderboard for update using (true);

-- ════════════════════════════════════════════════════════════════════
-- 系統三：分析埋點（analytics_events）
-- 遊戲事件經 /api/analytics（server，用 service role）寫入；dashboard 讀聚合。
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),  -- 事件發生時間（client 產生，離線批次都保真時序）
  player_key  text not null,                        -- 匿名裝置身分（同排行榜共用，無 PII）
  event       text not null,                        -- 事件名（見 src/lib/analytics/events.ts）
  props       jsonb not null default '{}'::jsonb,   -- 事件維度（speciesId / centreId / arMode / shiny …）
  app_version text,
  platform    text,                                 -- android / ios / mobile / desktop
  created_at  timestamptz not null default now()    -- server 收貨時間
);

-- 讀榜／時序聚合用嘅索引
create index if not exists analytics_events_ts_idx     on public.analytics_events (ts desc);
create index if not exists analytics_events_event_idx  on public.analytics_events (event);
create index if not exists analytics_events_player_idx on public.analytics_events (player_key);

alter table public.analytics_events enable row level security;

-- 寫入淨係由 server 端 service role 做（service role 繞過 RLS），所以「唔開」任何 anon policy＝
-- 匿名 client 直接寫／讀都會被 RLS 擋。dashboard 亦係經 server（service role）讀聚合。
-- 如果日後想 client 直接讀某啲公開聚合，先另開收窄嘅 select policy。
drop policy if exists "no anon access" on public.analytics_events;
-- （刻意唔加任何 policy＝anon/authenticated 一律無權；service role 照常運作。）

-- ── Rollup views（方便 SQL Editor / BI 工具直接睇；app 端聚合喺 JS 做，呢啲係額外方便）──

-- 每日活躍玩家 + 事件數
create or replace view public.analytics_daily as
select
  date_trunc('day', ts)::date        as day,
  count(*)                           as events,
  count(distinct player_key)         as active_players
from public.analytics_events
group by 1
order by 1 desc;

-- 每個事件嘅總數
create or replace view public.analytics_event_totals as
select event, count(*) as total, count(distinct player_key) as players
from public.analytics_events
group by event
order by total desc;

-- 捕捉最多嘅精靈（top species）
create or replace view public.analytics_top_species as
select
  props->>'speciesId'  as species_id,
  count(*)             as captures
from public.analytics_events
where event = 'capture_success' and props ? 'speciesId'
group by 1
order by captures desc;

-- ════════════════════════════════════════════════════════════════════
-- 玩家帳號 + 雲存檔（player_saves）
-- 綁 Supabase Auth user（匿名登入都有 user_id）；存檔本體 jsonb，
-- 另抽數值欄位（level/coins/spirit_count）denormalize 出嚟畀 founder dashboard 直接聚合。
-- player_key 一欄記返舊 localStorage 匿名 key，方便遷移 + 認返排行榜舊分。
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.player_saves (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  player_key   text,
  nickname     text not null default 'Hawker Hunter',
  faction_id   text,
  level        integer not null default 1,
  coins        integer not null default 0,
  spirit_count integer not null default 0,
  state        jsonb  not null default '{}'::jsonb,  -- 成份 zustand persist（hawker-hunt-save）
  save_version integer not null default 1,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists player_saves_player_key_idx on public.player_saves (player_key);
create index if not exists player_saves_updated_idx     on public.player_saves (updated_at desc);

alter table public.player_saves enable row level security;

-- 每個玩家淨係掂到自己嗰行（連匿名 auth user 都受保護）；server service role 繞過 RLS 照讀全部。
drop policy if exists "own save select" on public.player_saves;
drop policy if exists "own save insert" on public.player_saves;
drop policy if exists "own save update" on public.player_saves;

create policy "own save select" on public.player_saves
  for select using (auth.uid() = user_id);
create policy "own save insert" on public.player_saves
  for insert with check (auth.uid() = user_id);
create policy "own save update" on public.player_saves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════
-- 寵物中央註冊表（pets）
-- 手動 + AI 生成統一入呢度：既係系統二 draft 嘅持久層（取代 serverless 唔 persist 嘅
-- filesystem JSON），亦係 founder dashboard「寵物名冊 / 出寵物進度」嘅數據源。
-- 寫入一律經 server（service role 繞過 RLS）：webhook / publish / pipeline。
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pets (
  id            text primary key,                     -- species id（ascii kebab-case）
  source        text not null default 'generated',    -- 'manual' | 'generated'
  status        text not null default 'generating',   -- generating|awaiting-approval|approved|rejected|published|live
  series_id     text,
  stage         smallint,                             -- 1|2|3
  element       text,
  rarity        text,
  name          jsonb,                                -- { en, zh }
  definition    jsonb,                                -- 完整 Species 定義（publish 後 = species.ts 嗰份）
  instructions  text,                                 -- 生成前預設指示（Telegram inbox / --instructions）
  manifest      jsonb  not null default '{}'::jsonb,  -- 各 stage 狀態（PetDraft.manifest）
  artifacts     jsonb  not null default '{}'::jsonb,  -- { art, model3d, rigged, final } 路徑
  decision      jsonb,                                -- { verdict, reason, by, at }
  telegram      jsonb,                                -- { messageId, awaitingReason }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pets_status_idx on public.pets (status);
create index if not exists pets_source_idx on public.pets (source);
create index if not exists pets_series_idx on public.pets (series_id);

alter table public.pets enable row level security;

-- 已上線嘅寵物公開可讀（將來 client 想直接讀名冊都得）；未 published 嘅 draft 只有 server（service role）睇得到 / 改得到。
drop policy if exists "public read live pets" on public.pets;
create policy "public read live pets" on public.pets
  for select using (status in ('published', 'live'));

-- ════════════════════════════════════════════════════════════════════
-- 寵物生成工作佇列（pet_jobs）
-- 同 pets 分開：job 係一次生成要求，pets 係生成結果／中央名冊。
-- 參考圖放 Supabase Storage private bucket `pet-job-refs`；SQL schema 唔會自動建
-- Storage bucket，首次部署可經 Dashboard 建立，或由 jobs-repo ensureBucket best-effort 建立。
-- ════════════════════════════════════════════════════════════════════

alter table public.pets add column if not exists kind text;
alter table public.pets add column if not exists partner_label text;
alter table public.pets add column if not exists exclusive boolean;

create index if not exists pets_kind_idx on public.pets (kind);
create index if not exists pets_partner_label_idx on public.pets (partner_label);

create table if not exists public.pet_jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('catalogue', 'commission')),
  instructions    text,
  partner_label   text,
  exclusive       boolean not null default false,
  allow_text_only boolean not null default false,
  ref_images      jsonb not null default '[]'::jsonb,
  status          text not null default 'queued'
                  check (status in ('queued', 'running', 'consumed', 'cancelled', 'failed')),
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  consumed_at     timestamptz,
  started_at      timestamptz,
  pet_draft_id    text,
  error_message   text
);

create index if not exists pet_jobs_status_kind_created_idx
  on public.pet_jobs (status, kind, created_at);
create index if not exists pet_jobs_created_at_idx
  on public.pet_jobs (created_at desc);
create index if not exists pet_jobs_pet_draft_id_idx
  on public.pet_jobs (pet_draft_id);

alter table public.pet_jobs enable row level security;
-- 刻意唔加 public policy：job 只准 service role 存取（service role 繞過 RLS）。

-- 原子 claim：鎖住最舊 queued job；SKIP LOCKED 令多個 GHA runner 唔會撞單。
create or replace function public.claim_pet_job(p_kind text)
returns setof public.pet_jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_kind not in ('catalogue', 'commission') then
    raise exception 'invalid pet job kind: %', p_kind;
  end if;

  return query
  with next_job as (
    select id
    from public.pet_jobs
    where kind = p_kind
      and status = 'queued'
    order by created_at
    for update skip locked
    limit 1
  )
  update public.pet_jobs as job
  set status = 'running',
      started_at = now(),
      updated_at = now(),
      error_message = null
  from next_job
  where job.id = next_job.id
  returning job.*;
end;
$$;

revoke all on function public.claim_pet_job(text) from public;
revoke all on function public.claim_pet_job(text) from anon;
revoke all on function public.claim_pet_job(text) from authenticated;
grant execute on function public.claim_pet_job(text) to service_role;
