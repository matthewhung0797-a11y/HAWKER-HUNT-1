# Hawker Hunt 後台設計準備

> 呢份係「設計後台」前嘅準備文件：盤點現況、列出要搬上雲嘅嘢、擺低一份 schema 草稿同待你拍板嘅關鍵決策。**未落實作**，係俾我哋坐低設計時用嘅底稿。

---

## 1. 現況盤點

### 全部進度而家淨係喺 localStorage（`hawker-hunt-save`，zustand persist）

`src/lib/store.ts` 一個 store 揸晒所有嘢：

| 類別 | 欄位 |
|---|---|
| 玩家 | `nickname, level, exp, coins, gems, factionId, onboardingDone, loggedIn, devMode` |
| 精靈 | `ownedSpirits[]`（uid, speciesId, level, exp, caughtAt, centreId, shiny）、`captureCounts{}` |
| 道具 | `items{}` |
| 打卡 | `checkins[]`（centreId, date, timestamp）、`unlockedSilhouettes[]` |
| 社交/戰績 | `favouriteCentres[], lastBattleUid, battleWins, counterWins, evolveCount` |

**風險**：全部客戶端可改（改 localStorage 就無限 coins／滿圖鑑）；換機／清 cache 就冇晒進度；冇真實身分。

### 遊戲設定資料（靜態喺 code，`src/content/`）

`species.ts`（精靈＋技能＋進化需求）、`centres.ts`（5 據點 GPS＋spawnPool＋每日打卡上限）、`items.ts`、`badges.ts`、`elements.ts`、`factions`。呢啲係遊戲設計數據，改動要 redeploy。

### 已有嘅 Supabase（唯一）

- `supabase/schema.sql`：得一張 `leaderboard`，匿名公開讀寫，用裝置 `player_key`（uuid，冇 auth）。
- `src/lib/leaderboard.ts`：env 冇配置就安全退回 null（離線示範數據）。

### 打卡／QR 現況

- `/c/[centreId]` 落地頁 → 相機掃 QR 直接入打卡；`parseQR` 收任何域名嘅 `/c/<id>`。
- 打卡 GPS 檢查目前 **fail-open**（測試期，波地路臨時點）。判定全喺客戶端。

---

## 2. 要搬上後台嘅實體（by 優先級）

1. **帳號 + 雲存檔**（P0）：progress 跟人唔跟機；係其他一切嘅前提。
2. **伺服器權威動作**（P0–P1）：捕捉、打卡（GPS+QR 伺服器驗證）、進化、切磋結果、上分——防篡改。
3. **打卡點／QR 管理**（P1）：可以喺後台加一個實體 QR 點（好似波地路）唔使 redeploy。
4. **管理後台 / 分析**（P1–P2）：睇 DAU、每據點捕捉/打卡數、榜、事件開關、封號。
5. **內容管理**（P2，可選）：據點/spawnPool/活動搬入 DB 俾營運改。

---

## 3. Schema 草稿（Supabase / Postgres）

> 用 Supabase Auth 嘅 `auth.users`；每張表用 `user_id uuid references auth.users` + RLS「只可讀寫自己」。設定資料（species/centres）**建議先留 code**，只將「打卡點/QR」同「活動」入 DB。

```sql
-- 玩家檔案（1:1 auth.users）
create table profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  nickname     text not null default 'Hawker Hunter',
  faction_id   text,
  level        int  not null default 1,
  exp          int  not null default 0,
  coins        int  not null default 500,
  gems         int  not null default 20,
  onboarding_done bool not null default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- 擁有精靈（每隻一行）
create table owned_spirits (
  uid        uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  species_id text not null,
  level      int  not null default 1,
  exp        int  not null default 0,
  shiny      bool not null default false,
  centre_id  text,
  caught_at  timestamptz default now()
);
create index on owned_spirits (user_id);

-- 道具背包
create table inventory (
  user_id uuid not null references auth.users on delete cascade,
  item_id text not null,
  qty     int  not null default 0,
  primary key (user_id, item_id)
);

-- 打卡紀錄（伺服器寫，帶當時座標做審計）
create table checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  centre_id  text not null,
  checked_at timestamptz default now(),
  lat double precision, lng double precision
);
create index on checkins (user_id, centre_id);

-- 打卡點 / QR（可後台加，唔使 redeploy）
create table checkin_points (
  id         text primary key,        -- 例：'po-tei-court'
  centre_id  text,                    -- 對應遊戲據點（可 null = 純活動點）
  label      text,
  lat double precision, lng double precision,
  radius_m   int not null default 100,
  active     bool not null default true,
  temporary  bool not null default false  -- 波地路呢類臨時測試點
);

-- 排行榜（改為接 auth；保留現有匿名榜過渡）
-- score 由伺服器根據 profile/戰績計，唔俾客戶端直接寫。
```

**RLS 原則**：`profiles / owned_spirits / inventory / checkins` 只可 `user_id = auth.uid()`；`checkin_points` 公開讀、只 admin 寫；寫入型動作（捕捉/打卡/進化/上分）行 **Edge Function / RPC** 用 service role 驗證後先落庫，客戶端唔直接 insert 數值。

---

## 4. 關鍵決策（要你拍板）

1. **身分方式**：Supabase Auth 揀邊種？（magic-link email 最簡單、電話 OTP、或匿名 device → 之後綁定）
2. **防作弊力度**：MVP 係「信客戶端、只做雲存檔」定係「伺服器權威（Edge Function 驗證捕捉/打卡）」？後者穩陣但工多。
3. **打卡驗證**：伺服器要唔要真 GPS+QR 雙重驗證，定住繼續 fail-open 到公開測試後先收緊？
4. **內容放邊**：據點/精靈設定留喺 code（快、要 redeploy），定搬入 DB（營運可改、要做 admin UI）？
5. **管理後台形態**：先用 Supabase Dashboard／SQL 手動管，定要整一個自家 `/admin` 頁？

---

## 5. 建議分階段落地

- **Phase 0（雲存檔）**：Supabase Auth（magic-link）＋ `profiles/owned_spirits/inventory/checkins`＋一個 `syncService` 將 zustand 狀態雙向同步（登入後 pull，動作後 debounce push）。信客戶端，先攞返「跟人存檔」。
- **Phase 1（權威化）**：捕捉/打卡/進化/上分改行 Edge Function 驗證；打卡加 GPS+QR 伺服器檢查；`checkin_points` 入 DB。
- **Phase 2（營運）**：`/admin` 或 Metabase 睇分析；事件/spawn 活動開關；封號、榜維護。

---

## 6. Env / 設定 checklist

- `.env.local`：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`（已被 `leaderboard.ts` 用）；Edge Function 用 `SUPABASE_SERVICE_ROLE_KEY`（**只喺伺服器**）。
- Vercel：同名環境變數入 Project → Settings → Environment Variables。
- Supabase：開 project → 跑 migration → 設 RLS policy → 配 Auth provider。
- 遷移：首次登入將現有 localStorage 存檔 upload 一次（避免測試員進度歸零）。
```
