-- Hawker Hunt 後台管理系統 schema（/admin）
-- 用法：Supabase Dashboard → SQL Editor → 貼上成個檔案 → Run
--
-- ⚠️ 呢個檔案獨立於 supabase/schema.sql（遊戲主 schema），只加後台需要嘅表。
-- 唔會改動任何現有表 / RLS policy。
--
-- 三張表：
--   admin_users      —— 後台管理員名冊（判定權限；全部經 server API service role 讀寫）
--   admin_audit_log  —— 操作日誌（只准 insert，冇 update/delete）
--   player_flags     —— 玩家封鎖記錄（今期只記錄＋顯示，唔強制攔截；強制封鎖係下一步）
--
-- 全部 RLS：預設「唔開任何 anon/authenticated policy」＝匿名 / 一般登入用戶一律無權；
-- service role（server 端）繞過 RLS 照常運作。所有 admin 判定都行 server API，client 唔直接查。

-- ════════════════════════════════════════════════════════════════════
-- admin_users：後台管理員名冊
-- ════════════════════════════════════════════════════════════════════
-- 角色：
--   super    —— 全部權限（含管理員管理）
--   content  —— 精靈 + 據點（內容審批）
--   ops      —— 據點 + 數據報表（營運）
--   support  —— 用戶管理（客服）
--   analyst  —— 只讀全部（所有 mutation 拒絕）
--
-- 配對流程（最簡單可行方案）：
--   super 喺後台「系統設定」新增管理員時只填 email + 角色（user_id 暫時 null）。
--   對方用同一個 email 喺 Supabase Auth 註冊 / 被邀請後，首次登入後台，
--   server 會按 email 對號入座，自動回填 user_id → 即刻生效。
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
-- 刻意唔加任何 policy＝anon/authenticated 一律無權；service role（server）照常讀寫。

-- ════════════════════════════════════════════════════════════════════
-- admin_audit_log：操作日誌（只准 insert）
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  admin_email text not null,             -- 邊個管理員做嘅（登入 email）
  action      text not null,             -- 例如 'user.ban' / 'pet.approve' / 'admin.add' / 'centre.qr'
  target      text,                      -- 對象（user_id / species id / centre id …）
  detail      jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_ts_idx    on public.admin_audit_log (ts desc);
create index if not exists admin_audit_email_idx on public.admin_audit_log (admin_email);
create index if not exists admin_audit_action_idx on public.admin_audit_log (action);

alter table public.admin_audit_log enable row level security;
-- 只准 service role insert（唔開 anon policy）；冇 update / delete policy＝日誌不可竄改。

-- ════════════════════════════════════════════════════════════════════
-- player_flags：玩家封鎖記錄
-- ════════════════════════════════════════════════════════════════════
-- ⚠️ 今期只作「記錄 + 後台顯示」。唔會改任何現有表（player_saves / leaderboard …）嘅 RLS
--    去強制執行封鎖——強制攔截雲端功能要郁現有 policy（屬範圍外），係下一步。
create table if not exists public.player_flags (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  banned       boolean not null default false,
  reason       text,
  banned_until timestamptz,              -- null = 永久（當 banned = true 時）
  updated_at   timestamptz not null default now()
);

create index if not exists player_flags_banned_idx on public.player_flags (banned);

alter table public.player_flags enable row level security;
-- 唔開任何 anon/authenticated policy；只有 server service role 讀寫。

-- ════════════════════════════════════════════════════════════════════
-- 第一個 super admin：教你點填自己嘅 email / user_id
-- ════════════════════════════════════════════════════════════════════
-- 步驟：
--   1) 用你嘅 email 喺 Supabase Auth 開一個帳號（Dashboard → Authentication → Users →
--      Add user，設 Email + Password；或者去 /admin/login 之前先用 app 註冊）。
--   2) 喺 Authentication → Users 搵到嗰個 user，copy 佢個 UUID。
--   3) 反註釋下面其中一句，填返你嘅 email（同 user_id）再 Run。
--
--   -- 方法 A：連 user_id 一齊填（已經知 UUID，最直接）
--   -- insert into public.admin_users (user_id, email, role, active)
--   -- values ('00000000-0000-0000-0000-000000000000', 'you@example.com', 'super', true);
--
--   -- 方法 B：只填 email（user_id 留空，首次登入自動配對）
--   -- insert into public.admin_users (email, role, active)
--   -- values ('you@example.com', 'super', true);
