-- ════════════════════════════════════════════════════════════════════
-- Hawker Hunt 後台管理系統 schema（/admin）
-- 用法：Supabase Dashboard → SQL Editor → 貼上成個檔案 → Run
--
-- ⚠️ 獨立於 supabase/schema.sql（遊戲主 schema），只加後台需要的表，
--    不會改動任何現有表 / RLS policy。全部 idempotent（可重複跑）。
--
-- 表一覽：
--   admin_users      —— 後台管理員名冊（判定權限；全部經 server API service role 讀寫）
--   admin_audit_log  —— 操作日誌（只准 insert，無 update/delete）
--   player_flags     —— 玩家封鎖記錄（MVP：記錄＋後台顯示，不強制攔截）
--   announcements    —— 全服公告（popup / banner，可排程）
--   gift_packs       —— 禮包定義（可設兌換碼；contents = coins/gems/items）
--   gift_grants      —— 禮包發放記錄（unique 防重複領；claimed_at null = 信箱待領）
--   app_config       —— 全域設定（maintenance 維護模式 / version 版本控制）
--
-- RLS 原則：全部「不開任何 anon/authenticated policy」＝匿名/一般玩家一律無權；
-- service role（server 端 server actions / API route）繞過 RLS 照常運作。
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- 1. admin_users：後台管理員名冊
--    角色：super（全部）/ content（內容）/ ops（營運）/ support（客服）/ analyst（只讀）
--    配對流程：super 在後台新增管理員只填 email + 角色（user_id 暫 null），
--    對方用同一個 email 在 Supabase Auth 開帳後首次登入 /admin，
--    server 按 email 對號入座自動回填 user_id。
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete cascade,  -- 首次登入配對後回填
  email      text unique not null,
  role       text not null default 'analyst'
             check (role in ('super', 'content', 'ops', 'support', 'analyst')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists admin_users_email_idx on public.admin_users (lower(email));

alter table public.admin_users enable row level security;
-- 刻意不加任何 policy＝anon/authenticated 一律無權；service role（server）照常讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 2. admin_audit_log：操作日誌（只准 insert，不可竄改）
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  admin_email text not null,             -- 哪個管理員做的（登入 email）
  action      text not null,             -- 例如 'admin.login' / 'player.ban' / 'gift.grant' / 'config.maintenance'
  target      text,                      -- 對象（user_id / pack id / announcement id …）
  detail      jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_ts_idx    on public.admin_audit_log (ts desc);
create index if not exists admin_audit_email_idx on public.admin_audit_log (admin_email);
create index if not exists admin_audit_action_idx on public.admin_audit_log (action);

alter table public.admin_audit_log enable row level security;
-- 只准 service role insert；無 update/delete policy＝日誌不可竄改。

-- ════════════════════════════════════════════════════════════════════
-- 3. player_flags：玩家封鎖記錄
--    MVP：只作「記錄＋後台顯示」。強制攔截（改現有表 RLS）屬下一步。
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.player_flags (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  banned       boolean not null default false,
  reason       text,
  banned_until timestamptz,              -- null = 永久（當 banned = true 時）
  updated_at   timestamptz not null default now()
);

create index if not exists player_flags_banned_idx on public.player_flags (banned);

alter table public.player_flags enable row level security;
-- 不開任何 anon/authenticated policy；只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 4. announcements：全服公告
--    kind: 'popup'（進遊戲彈窗一次）/ 'banner'（頂部橫條可關閉）
--    遊戲端經 server action（service role）讀取，所以不需開公開讀 policy。
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  kind       text not null default 'popup' check (kind in ('popup', 'banner')),
  active     boolean not null default true,
  starts_at  timestamptz,                -- null = 即時生效
  ends_at    timestamptz,                -- null = 永久（直到 active=false）
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists announcements_active_idx on public.announcements (active, starts_at, ends_at);

alter table public.announcements enable row level security;
-- 刻意不加任何 policy＝只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 5. gift_packs：禮包定義
--    contents jsonb = { "coins": 500, "gems": 20, "items": { "chopsticks": 10 } }
--    code：兌換碼（唯一；可 null＝僅供後台直接發放，不開放玩家兌換）
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.gift_packs (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  title           text not null,
  contents        jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  per_user_limit  integer not null default 1,   -- MVP 靠 unique(pack_id, user_id) 固定為 1
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_by      text,
  created_at      timestamptz not null default now()
);

create index if not exists gift_packs_code_idx on public.gift_packs (code);
create index if not exists gift_packs_active_idx on public.gift_packs (active, starts_at, ends_at);

alter table public.gift_packs enable row level security;
-- 刻意不加任何 policy＝只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 6. gift_grants：禮包發放記錄
--    unique(pack_id, user_id) 防重複領取（兌換碼重複輸入會撞約束）
--    claimed_at null = 後台發放、玩家信箱待領取；兌換碼路徑直接填 now()
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.gift_grants (
  id         bigint generated always as identity primary key,
  pack_id    uuid not null references public.gift_packs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,                        -- 直接發放的管理員 email；玩家自助兌換 = null
  unique (pack_id, user_id)
);

create index if not exists gift_grants_user_idx on public.gift_grants (user_id, claimed_at);
create index if not exists gift_grants_pack_idx on public.gift_grants (pack_id);

alter table public.gift_grants enable row level security;
-- 刻意不加任何 policy＝只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 7. app_config：全域設定（key-value）
--    maintenance: { enabled, message }        —— 維護模式（下架遊戲）
--    version:     { minVersion, androidUrl, iosUrl, forceUpdate }
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
-- 刻意不加任何 policy＝只有 server service role 讀寫。

insert into public.app_config (key, value) values
  ('maintenance', '{"enabled": false, "message": ""}'::jsonb),
  ('version', '{"minVersion": "0.1.0", "androidUrl": "", "iosUrl": "", "forceUpdate": false}'::jsonb)
on conflict (key) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- 8. spirit_config：精靈開關／生成權重（後台「精靈管理」）
--    無 row = 預設預設啟用、權重 1（零遷移風險；遊戲端 getGameConfig 合併）。
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.spirit_config (
  spirit_id    text primary key,          -- species.ts 的 id
  active       boolean not null default true,
  spawn_weight integer not null default 1 check (spawn_weight between 0 and 10),
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

alter table public.spirit_config enable row level security;
-- 刻意不加任何 policy＝只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 9. centre_config：據點開關 + spawnPool 覆蓋（後台「據點管理」）
--    spawn_pool null = 用 centres.ts 預設池；active false = 地圖隱藏＋不生成。
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.centre_config (
  centre_id    text primary key,
  active       boolean not null default true,
  spawn_pool   text[],                    -- null = 用 code 預設
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

alter table public.centre_config enable row level security;
-- 刻意不加任何 policy＝只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 10. missions：任務（後台「任務管理」CRUD；遊戲端 getActiveMissions 讀）
--     title jsonb = {zh, en}；reward jsonb = {coins, gems, items:{id:qty}}
--     period: 'daily'（每日重置）| 'once'（一次性特別任務）
-- ════════════════════════════════════════════════════════════════════
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
-- 刻意不加任何 policy＝只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 11. notifications：站內通知（後台「推送通知」發送；遊戲端鈴鐺讀取）
--     user_id null = 全服廣播；icon = emoji；link = 站內路由（可空）。
-- ════════════════════════════════════════════════════════════════════
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
-- 刻意不加任何 policy＝只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 第一個 super admin 開通步驟：
--   1) Supabase → Authentication → Users → Add user（自己的 email + 密碼）
--   2) 在下面反註釋、填自己的 email 再 Run（首登 /admin 時自動配對 user_id）：
--
--   insert into public.admin_users (email, role, active)
--   values ('you@example.com', 'super', true);
-- ════════════════════════════════════════════════════════════════════
