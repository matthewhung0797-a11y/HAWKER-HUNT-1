# 營運系統 Setup Checklist

呢份係「你要做嘅事」清單。程式碼地基已經起好，全部功能都係**填咗 key 先通電、唔填就 graceful skip**，所以可以逐步嚟、唔會因為未接好而爆版。

打勾順序建議：先 Telegram（睇到通知）→ 再 health/uptime → 再 rollback → 最後 AI 修復。

---

## 0. 共用地基（已完成，程式碼層）

- [x] `src/lib/ops/config.ts` — 中央讀 env（全部選填）
- [x] `src/lib/ops/telegram.ts` — Telegram 通知 / 確認按鈕模組
- [x] `.env.example` — 所有 key 範本
- 你要做：`cp .env.example .env.local`，之後逐格填。

---

## 1. Telegram（最先做，之後所有通知都靠佢）

- [ ] Telegram 開 `@BotFather` → `/newbot` → 攞 **bot token**
- [ ] 同你個新 bot 傾一句嘢，再開 `@userinfobot` 攞你嘅 **chat id**（或用 group id）
- [ ] 填 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`
  - 本機：入 `.env.local`
  - 線上：Vercel → Project → Settings → Environment Variables
  - CI：GitHub → repo → Settings → Secrets and variables → Actions
- [ ] 驗證：本機 `node scripts/ops/notify-telegram.mjs "hello"` 應收到訊息

## 2. 健康檢查 + Uptime 監測（系統一）

- [x] `/api/health` 端點（已起好，回 JSON + 200/503）
- [x] `.github/workflows/uptime-monitor.yml`（每 5 分鐘 cron）
- 你要做：
  - [ ] 部署到 Vercel 後，喺 GitHub Actions secrets 加 `HEALTH_URL`（例如 `https://你的網址/api/health`）
  - [ ] （可選）加多層外部監測：UptimeRobot / Better Stack 免費 tier，指向同一 URL，多一重保險
  - [ ] 驗證：Actions 頁面手動 run `uptime-monitor`，睇有冇綠燈

## 3. 自動 Rollback（系統一，瞓覺保命網）

- [x] `.github/workflows/auto-rollback.yml` + `scripts/ops/rollback.mjs`（已起好）
- 你要做：
  - [ ] Vercel → Account Settings → Tokens 生成 `VERCEL_TOKEN`
  - [ ] 攞 `VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`（`.vercel/project.json` 或 dashboard）
  - [ ] 三個都入 GitHub Actions secrets
  - [ ] 驗證：手動 run `auto-rollback`（reason 填 test），睇有冇回滾 + Telegram 通知

## 4. 前端錯誤監測（系統一）

- [x] `/api/client-error` + `src/app/global-error.tsx`（已起好，自建通道即刻用得）
- 你要做（可選升級）：
  - [ ] Sentry 開免費 project → 攞 DSN → 填 `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
  - [ ] （之後）裝 `@sentry/nextjs` 正式接埋 source map

## 5. AI 自動修復（系統一，開 PR 唔 deploy）

- [x] `.github/workflows/ai-fix.yml`（已起好，草案 PR 流程）
- 你要做：
  - [ ] 攞 `CURSOR_API_KEY`（Cursor → Settings）入 GitHub Actions secrets
  - [ ] （建議）開埋 Bugbot 自動 review AI 開嘅 PR
  - [ ] 驗證：手動 run `ai-fix`，incident 填一個假 bug，睇會唔會開到草案 PR

---

## 6. 系統二：自動出寵物管線（骨架已起好，可即 dry-run）

程式碼骨架已完成，**冇 key 都行到成條 dry-run mock**（`concept→art→model3d→rig→finalize→skills→draft`），
出一份 pending pet draft JSON，再喺後台審批（人批准先出街）。Telegram 只保留通知／`/pet` fallback。

### 6.0 即刻試（唔使任何 key）

- [ ] Dry-run 出一隻 mock 寵物：
  - `node scripts/pipeline/run.mjs --id=demo-pet`
  - → 生成 `content/pending-pets/demo-pet.json`（各 stage 標 `mock`），審批因未設 Telegram 而 graceful skip（會 print 預覽）
- [ ] 離線批准 + 預覽出街（唔會改 `species.ts`）：
  - `node scripts/pipeline/set-decision.mjs demo-pet approve`
  - `node scripts/pipeline/publish.mjs demo-pet` → 出 `content/pending-pets/demo-pet.published-preview.ts`（species 條目預覽）
- [ ] 試否決 + 補原因：
  - `node scripts/pipeline/set-decision.mjs demo-pet reject "與某商店簽咗約，要做佢哋獨家寵物"`

### 6.1 通電：真生成（要花 credits，確認過先做）

- [ ] `GEMINI_API_KEY`（2D 概念圖 / 文案；未接真流程前 concept/art 仍用 mock）
- [ ] `MESHY_API_KEY`（`msy_` 開頭）／`TRIPO_API_KEY`（`tsk_` 開頭，唔係 `tcli_`）— 3D 生成
- [ ] 填好後 `--live` 真跑：`node scripts/pipeline/run.mjs --id=<id> --live`
  - 真流程會包住現有 `scripts/gen-3d.mjs` / `tripo-rig-animate.mjs` / `finalize-models.mjs`
- [ ] ⚠️ `modelYaw` 要用 `node scripts/diag-yaw-sweep.mjs <id>` 校準（見 `spirit-3d-models` skill）

### 6.2 工單資料庫 + 後台審批閘

- [ ] Supabase SQL Editor 重新執行 `supabase/schema.sql`：建立 `pet_jobs`、原子 claim function，同 `pets.kind / partner_label / exclusive` mirror 欄位
- [ ] Supabase Storage 建 private bucket `pet-job-refs`；runner 會簽 URL 下載參考圖去 `_job-assets/<draftId>/`
- [ ] 所有 approve/reject 只喺 `/admin/spirits` 後台做；Telegram 訊息冇 inline 批准按鈕
- [ ] Telegram secrets 已設（見第 1 節）時會收到三階預覽 + 後台審批提醒
- [ ] Telegram `/pet <方向>`／傳圖 = fallback 開 `commission` 工單（寫 `pet_jobs`＋Storage）；正式開單／上傳／開跑／審批一律後台 `/admin/spirits`

### 6.3 每週／工單自動化（生成 → 開 PR → 後台審批）

- [x] `.github/workflows/pet-pipeline.yml`（每週一 cron + 手動 `workflow_dispatch` + `pet-generate` dispatch）
  - cron 永遠只 claim `catalogue`；冇單就自由發揮，永遠唔會 claim `commission`
  - 後台預設先跑 `concept-art`（concept＋立繪）；睇圖滿意後先用 `from-3d` 續跑 3D／rig／技能
  - `pet-generate` payload 帶 `jobId`／`draftId`、`phase`、`kind`、`live`；手動執行亦可填同類 inputs
  - LIVE 模式：生成後會把 draft + 產物（webp/GLB）commit 落分支 `auto-pet/<id>` + 開 PR，
    再通知去後台審批。mock/dry-run 只保持 `generating`，唔會進入待審板。**永遠唔會自己合併落 main。**
- 你要做：
  - [ ] 上述 key（含 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）入 GitHub Actions secrets（缺就自動 dry-run mock，唔會爆）
  - [ ] 驗證：後台建立 catalogue job → trigger → Actions 收到 `pet-generate` → 開 PR + 後台見到 `awaiting-approval`

### 6.4 後台 approve 自動上線（閉環，關機都行）★

後台按 approve → API 觸發 GitHub `repository_dispatch` → `pet-publish.yml` 喺**雲端**
完成 `publish --commit`（append `species.ts`/`centres.ts`/`items.ts`）→ 跑 `tsc` 閘 → 合併 PR 落 main
→ Vercel 偵測 main push 自動部署上線。全程唔使你部電腦開機。reject → 自動關 PR + 刪分支。

- [x] `src/lib/ops/github.ts` + 後台審批 API 已接（按掣即觸發）
- [x] `.github/workflows/pet-publish.yml`（`on: repository_dispatch [pet-approved, pet-rejected]`）
- 你要做（呢兩條係閉環嘅新 key）：
  - [ ] GitHub → Settings → Developer settings → **Fine-grained PAT**：只揀呢個 repo，權限
        **Contents: Read/Write** + **Actions: Read/Write**（觸發 dispatch 用）
  - [ ] Vercel → Project → Settings → Environment Variables 加：
    - `GITHUB_DISPATCH_TOKEN`＝上面個 PAT
    - `GITHUB_REPO`＝`<你的 GitHub 帳號>/<repo 名>`（例如 `alan/hawker-hunt`）
  - [ ] （若開咗 branch protection）容許 `pet-publish` 用 `--admin` 合併，或者對 bot 開 bypass
- 驗證：由後台觸發 live 工單開一個 PR → 喺 `/admin/spirits` 按 approve → 應收到
  「🎉 已上線」+ 幾分鐘後 Vercel 有新部署；按 reject → PR 自動關閉。
- 缺 `GITHUB_DISPATCH_TOKEN`/`GITHUB_REPO` 時，後台會顯示 dispatch 失敗，唔會假裝已開始 publish。

> ✅ **持久化已解決**：draft + 產物由生成 workflow commit 落 `auto-pet/<id>` 分支（唔再靠短命 FS／artifact），
> 審批狀態亦鏡射落 Supabase `pets` 表。Vercel webhook 只負責「觸發」，真正 git 寫入／合併由 GitHub Actions
> 用內置 `GITHUB_TOKEN` 做——所以線上按 approve 可靠、關機都行。
>
> ✅ **聯乘工單已閉環**：commission 方向／partner label／獨家標記寫入 `pet_jobs`，參考圖放
> private `pet-job-refs`；GitHub runner claim 後下載。commission live 冇 Gemini key 會 hard fail，唔會用 mock 交單。

---

## 7. 系統三：數據 dashboard（埋點 + 創辦人數據台）

程式碼骨架已完成，**冇 Supabase key 都行到**：埋點 `track()` 自動 no-op、`/api/analytics` 回 200 skipped、
`/founder` dashboard 顯示離線示範數據。填齊三條 key 就自動通電（埋點寫入 Supabase + dashboard 讀實時聚合）。

### 7.0 即刻試（唔使任何 key）

- [ ] 開 `http://localhost:3000/founder`（本機開發未設 `OPS_SECRET` 就無需密碼）→ 應見到示範 KPI／圖表，右上角標「○ 離線示範數據」。
- [ ] （可選）`.env.local` set `NEXT_PUBLIC_ANALYTICS_DEBUG=1` → 玩遊戲時 console 會印出每個埋點事件。

### 7.1 通電：接 Supabase

- [ ] Supabase 開 project → **SQL Editor** → 貼上 `supabase/schema.sql` 全個檔案 → Run
      （會建 `leaderboard` + `analytics_events` 表 + 3 條 rollup views；已存在會 skip）
- [ ] Project Settings → API 攞三條 key，填入 `.env.local`（線上填 Vercel env）：
  - `NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`（排行榜／client 用）
  - `SUPABASE_SERVICE_ROLE_KEY=eyJ...`（**server-only**，埋點插入 + dashboard 聚合用；⚠️ 唔好加 `NEXT_PUBLIC_` 前綴、唔好外洩）
- [ ] 重啟 dev server（env 要重讀）。玩幾局 → `/founder` 右上角應變「● 實時數據」。

### 7.2 保護 dashboard

- [ ] set `OPS_SECRET`（同系統一共用嗰條就得）。設咗之後 `/founder` 同 `/api/analytics/summary` 都要帶 `?key=<OPS_SECRET>` 先入到。
      ⚠️ 呢個係輕量閘門，正式版要接真 auth（Supabase Auth / allowlist）。

### 7.3 驗證

- [ ] 冇 key：`/founder` 有示範數據；`curl -X POST /api/analytics -d '{"events":[]}'` 回 `{ok:true}`。
- [ ] 有 key：玩一局捕捉／切磋／打卡 → Supabase Table Editor 見到 `analytics_events` 有新 row → `/founder` KPI 動。

> 目前已埋嘅點：`app_open`、`session_end`、`capture_success`、`battle_win`、`checkin`、`evolve`、`leaderboard_view`。
> 未埋（代碼留咗 `// TODO 埋點`）：`capture_start`／`capture_fail`／`battle_start`／`battle_lose`。

> 亦：系統二 draft 持久化後端可之後同接 Supabase（同一 project）。準備好就通知我逐個接埋。
