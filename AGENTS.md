<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hawker Hunt — Agent 指南

新加坡小販中心主題嘅 LBS＋AR PWA 遊戲（Pokémon GO 式）。捕捉美食精靈、打卡、進化、切磋。
呢份文件係所有 agent 視窗嘅共同規範：開工前讀一次，尤其係「踩過嘅坑」一節。

## 溝通同編碼慣例

- **回覆用戶一律用中文**；代碼註釋用廣東話（跟現有風格）
- 註釋只寫「點解咁做」，唔好複述代碼做緊乜
- 所有 id（species/item/centre/skill）用 ASCII kebab-case
- 界面文案**必須**同步改 `src/i18n/messages/zh.json` 同 `en.json` 兩份
- 唔好 commit：用戶冇叫就唔好行任何 git 寫操作
- **收到新指令淨係改嗰單嘢要改嘅檔案，千祈唔好順手郁其他 code**（改咗無關嘅嘢好多次整咗新 bug 出嚟）。要改範圍外嘅嘢先問過用戶；能夠用「新增檔案／script」達到目的就唔好改現有檔案

## 環境須知（Windows）

- **正式部署 domain：`https://hawker-hunt-rust.vercel.app`**（唔使再問用戶）。QR／連結／landing 一律用呢個
- Shell 係 **PowerShell**：`&&` 唔一定食，用 `;` 分隔或者分開行
- dev server 通常**已經喺 `http://localhost:3000` 行緊**——開新命令前先睇 terminals 有冇現成，唔好重複開（會變 3001 引致測試打錯位）
- `.env.local` 有 Meshy／Tripo／ElevenLabs API key（3D 模型、音樂生成用）；Supabase 兩條 `NEXT_PUBLIC_SUPABASE_*` key 由用戶配置，冇嘅話排行榜自動退回離線示範數據
- CSS 改咗但瀏覽器冇反應：可能係 `.next` cache 舊咗，剷咗佢重啟 dev server

## 架構地圖

### 內容數據（唯一真相來源，改遊戲內容淨係郁呢度）

| 檔案 | 內容 |
|---|---|
| `src/content/species.ts` | 15 隻精靈（5 系列 × 3 階段）：名、五行五味、數值、技能、進化條件、`modelUrl`／`animated`／`rigLite`／`modelYaw` |
| `src/content/centres.ts` | 5 個小販中心據點（真實 GPS）、五大陣營、`spawnPool`、`featuredSpeciesId` |
| `src/content/elements.ts` | 五行相剋：金→木→土→水→火→金，剋 1.5×／被剋 0.75× |
| `src/content/items.ts` | 進化道具 |
| `src/content/skill-fx.ts` | 每個技能嘅特效配置（archetype／顏色／tier／美食粒子形狀） |
| `src/content/battle-bgs.ts` | 5 個切磋場景（背景圖＋打光＋氛圍粒子），`homeCentreOf()` 由 series→據點推導 |
| `src/content/badges.ts` | 徽章牆成就定義 |

### 核心系統

| 檔案 | 內容 |
|---|---|
| `src/lib/store.ts` | Zustand＋persist（localStorage key `hawker-hunt-save`）。玩家等級、精靈（含 exp／shiny）、道具、打卡、戰績、`devUnlockAll` |
| `src/lib/sfx.ts` | 程序化音效（Web Audio 合成，零音頻檔）＋震動；新音效跟現有 `tone()`/`noise()` 寫法 |
| `src/lib/music.ts` | 背景音樂單例（global registry，`playMusic`/`stopMusic`/`duckMusic`）；MP3 喺 `public/music/` |
| `src/lib/leaderboard.ts` | Supabase 排行榜（匿名 player_key、上分 upsert、讀榜）；schema 喺 `supabase/schema.sql` |
| `src/lib/xr8.ts`＋`src/components/ar/Xr8Layer.tsx` | 8th Wall SLAM 載入器＋雙 canvas 橋接（XR8 畫相機底層，R3F 透明頂層每 frame 同步 pose） |
| `src/components/three/SpiritModel.tsx` | GLB／sprite 精靈渲染、動畫 clips、shiny 色相偏移、`rigLite` 程序化補動 |
| `src/components/three/BattleFx.tsx`＋`food-particles.ts` | 技能特效粒子（美食形狀 canvas 貼圖） |
| `src/components/GlobalPressFx.tsx`＋`.cursor/rules/game-feel-buttons.mdc` | 全局按鈕音效／彈跳；自定義按鈕用 `data-no-press-sfx` 退出全局音效 |

### 營運自動化（系統一監測 / 系統二出寵物 / 系統三數據）

全部「填 key 先通電、唔填 graceful skip」。詳細設定睇 `docs/ops/SETUP-CHECKLIST.md`。

| 檔案 | 內容 |
|---|---|
| `src/lib/ops/config.ts` | 中央讀 env（Telegram／Supabase／pipeline key／`github` dispatch／`opsSecret`） |
| `src/lib/ops/telegram.ts`／`github.ts` | Telegram 通知＋收檔；`github.ts` 觸發 `repository_dispatch` |
| `scripts/pipeline/*`＋`stages/*` | 系統二出寵物：`run.mjs`（orchestrate）→ concept/art/model3d/rig/finalize/skills → `publish.mjs`（`--commit` append species/centres/items） |
| `src/lib/pipeline/pets-repo.ts` | Supabase `pets` 表持久層（serverless 可靠真相；draft/審批狀態鏡射落呢度） |
| `.github/workflows/pet-pipeline.yml` | 每週生成 → commit 落 `auto-pet/<id>` 分支 + 開 PR + 送 Telegram 審批（**唔會自己 merge**） |
| `.github/workflows/pet-publish.yml` | `on: repository_dispatch`：按 approve → publish+tsc 閘+合併 main；reject → 關 PR |

**按 approve 自動上線閉環**（關機都行）：Telegram 按掣 → Vercel `api/telegram/webhook` → `dispatchRepositoryEvent` → `pet-publish.yml`（用內置 `GITHUB_TOKEN` 做 git 寫入／合併）→ Vercel 偵測 main push 自動部署。要 Vercel env `GITHUB_DISPATCH_TOKEN`＋`GITHUB_REPO`。

### 頁面重點

- `src/app/capture/page.tsx` — 捕捉：四層模式自動降級 `slam`（8th Wall）→ `gyro` → `3d`（`CaptureStage3d` 場景）→ `static`（2D）；縮圈時機＋搏鬥狂撳＋狂暴；摸頭／餵食安撫互動；shiny 1/50
- `src/app/battle/page.tsx` — 切磋：回合制＋能量（普攻儲能、技能耗能）＋敵方預警掃屏閃避 QTE；等級屬性成長；勝利掉落敵方系列進化材料；開場前出戰精靈選擇器
- `src/app/map/page.tsx` — MapLibre 地圖：zoom 連動 pitch、遊走精靈 marker、據點徽章
- `src/app/evolve/[uid]/page.tsx` — 進化動畫（注意 hydration：初始 `pending` stage）

## 驗證流程（每次改動必行）

1. `npx tsc --noEmit` 零錯誤
1b. 面向相關（species modelYaw／GLB／battle lookAt／SpiritModel）：`npm run facing:static` 必過；掂到敏感檔再 `npm run facing:diff`（要 `:3000`）。見 `.cursor/rules/spirit-battle-facing.mdc`
2. 寫／跑 `scripts/diag-*.mjs` Playwright 診斷（項目慣例，參考現有腳本）：
   - launch 加 `--enable-unsafe-swiftshader`；要相機就加 fake media flags＋`permissions: ["camera"]`
   - 用 `addInitScript` 預填 `hawker-hunt-save`（只喺唔存在時 set，避免導航時洗檔）
   - 截圖去 `test-shots/`，**必須用 Read 工具肉眼睇截圖**確認視覺效果
   - Playwright 嘅 `page.mouse.move/down/up` **觸發唔到 React `onPointerMove`**（缺 pointerId/pointerType）——用 `page.evaluate` 直接 `el.dispatchEvent(new PointerEvent(...))`。測時間敏感 QTE（閃避／夾實）要**先做動作先截圖**，倒轉次序截圖會食掉時間窗令判定失準
3. headless 測唔到嘅（SLAM、陀螺儀、GPS）：話俾用戶知點樣真機測（`npx ngrok http 3000`，鏡頭要 HTTPS）

## 踩過嘅坑（改相關嘢前必讀）

- **species.ts 唔好亂 revert**：內容係逐步累積嘅，`git checkout` 會炒走大量後加數據
- **音樂重疊**：所有播放必須經 `music.ts` 嘅 registry（`playMusic` 會自動 retire 其他 track）；唔好自己 new Audio
- **MapLibre marker 唔好加 CSS transform**：全局 `[role="button"]:active { scale }` 已特登排除 `.maplibregl-marker`——scale 會喺 maplibre 嘅 translate 之前生效，成個 marker 彈開令 click 落空；marker root 亦唔可以有 inline `position:relative`（會蓋過 maplibre 嘅 absolute 定位）
- **Zustand hydration**：persist 喺 client 掛載後先 rehydrate。讀 `localStorage` 嘅初始 state 會 SSR mismatch——初始值寫死，`useEffect` 入面先同步真值；依賴 `ownedSpirits` 嘅頁面要等 hydrated 先好 redirect
- **React 閉包陷阱**：battle/capture 嘅 raf／setTimeout 循環入面讀 state 要用 ref（`hpRef`／`calmRef` 呢啲 pattern）
- **相機只可以一邊開**：8th Wall 自己揸 getUserMedia，入 slam 模式前要停頁面自己嘅 video stream（`needVideo` 邏輯已處理，唔好破壞）
- **Tripo 模型**：朝向係 +X（要 `modelYaw`）；動畫有 root motion 要 strip 先做 `lookAt`；簡骨架用 `rigLite` 疊程序化動畫；生成任務記錄喺 `model-pipeline/gen/tasks*.json`，重生成要先標 failed／刪對應條目
- **手持武器嘅角色唔可以行 Meshy 管線**：Meshy 生成用 a-pose 會食走手持道具，Meshy rig 對武器輪廓嘅 pose estimation 亦幾乎必敗（實測 11 中 10 敗）——武器角色直接 Tripo 生成＋Tripo rig，詳細決策樹睇 `.cursor/skills/spirit-asset-pipeline/SKILL.md`
- **`diag-yaw-sweep.mjs` 個 `__dbgYaw` override 係壞嘅**：`SpiritModel`／battle 根本冇讀呢個 window hook，所以四個角度嘅截圖全部一樣（都係已 commit 嘅 `modelYaw`）。校 yaw 要改 `species.ts` 再 render，或者睇真 battle 圖判斷（背向鏡頭＝面向敵人＝啱）。詳見 `.cursor/skills/spirit-3d-models/SKILL.md`
- **圓身無四肢 blob（例如飯團 baby）rig 必敗**：唔好硬「手臂張開」重畫（毀設計＋燒 credits）；`finalize.mjs` 已自動退用 Tripo 靜態網格（`animated:false`＋程序化 idle 托底）。靜態 species pattern：`modelUrl`＋`modelYaw`，唔加 `animated`／`rigLite`
- **Vercel serverless FS 短命唯讀**：webhook 寫檔（審批狀態／inbox）唔會 persist——狀態要行 Supabase（`pets` 表）；真正 git 寫入／合併要行 GitHub Actions（`pet-publish.yml`），Vercel 只負責觸發 `repository_dispatch`
- **全站「拉到底」scroll**：`layout.tsx` 個 `body` 係 `flex flex-col`，會將頁面 `<main>` 壓到 viewport 高度，內容多過一屏就俾固定底欄遮住（淨加 padding 都救唔到）——`<main>` 要加 `shrink-0` 先撐得返足內容高度。固定底欄留白用 `pb-[calc(6rem_+_env(safe-area-inset-bottom))]`；⚠️ Tailwind arbitrary value 入面**空格要寫成 `_`**，直接寫 `calc(6rem + env(...))` 會 parse 唔到
- **R3F canvas 影相／截圖**：`<Canvas>` 要 `gl={{ preserveDrawingBuffer: true }}`，否則 `toDataURL()` 出空白（WebGL 預設每 frame clear buffer）；自拍功能靠呢個先影到 3D 寵物落相
- **3D 物件上貼 DOM overlay（例如寵物頭頂對話氣泡）**：喺 `useFrame` 用 camera 將世界座標 project 落 screen 座標，寫入 ref 再定位 DOM element（**唔好每 frame set React state**，會爆 render）；要烘焙落相就喺 2D canvas 用同一組 projected 座標再畫一次
- **粉圓體子集要跟內容重建**：`public/fonts/openhuninn-subset.woff2` 由 `node scripts/build-font.mjs` 從 i18n／species／badges 等掃字生成。加新寵物名／文案／徽章名之後若唔 rebuild，缺字會 fallback 去 Noto／系統字——同一個名入面「卜」變粗、「史詩級」變另一隻字型就係呢個（子集過期）。來源 TTF `jf-openhuninn.ttf` 唔入 git，本機先 rebuild 得
- **`store.devMode` 唔可以做 production 功能閘**：個 toggle 喺個人檔案頁，玩家自己開得到——用嚟守「模擬打卡」之類就等於畀人唔掃 QR 都打到卡。真係開發專用嘅 UI 要 `process.env.NODE_ENV === "development"`（build time 就 tree-shake 走）
- **打卡 GPS 係 hard gate（fail-closed）**：掃到 QR 後必須 `getCurrentPosition` 成功且距離 ≤ `GEOFENCE_RADIUS_TOLERANT_M`（而家 200m）；拒定位／逾時／冇 geolocation／超距一律拒。淨係 `NODE_ENV===development`＋`store.devMode`（simulate 掣）先跳過。QR URL 公開，屋企掃相複本靠呢度擋；簽名 QR＋server 仍係中期目標。唔好改返 fail-open
- **「儲存相片」一定要經 Web Share files**：`<a download>` 喺 iOS Safari 只會開新一頁圖、Android 亦只落 Downloads，兩邊都唔入相簿。要 `navigator.canShare({files})` → `navigator.share({files})`（share sheet 入面就有「儲存影像」），catch 到 `AbortError` 係用戶自己取消，唔好再彈下載
- **3D 場景嘅道具／工具（例如捕捉筷子）要落 R3F scene，唔好用 CSS overlay**：CSS 疊喺 canvas 上面冇深度資訊，喺 AR／3D 模式會同寵物視覺重疊「浮」喺面前；擺入 scene 先有正確深度遮擋、AR/3D 表現一致

## 素材管線

**可攜通用 Playbook**（其他 app／外包）：`.cursor/skills/creature-asset-pipeline/`（亦已裝去 `~/.cursor/skills/`）。  
Hawker 實作細節：`.cursor/skills/spirit-asset-pipeline/SKILL.md`；接線表：`creature-asset-pipeline/adapters/hawker-hunt.md`。速查：

- **3D 模型**：`scripts/gen-3d.mjs`（文字→3D，Meshy/Tripo，耗 credits——生成前同用戶確認）→ `scripts/tripo-rig-animate.mjs`（rig＋7 套動畫）→ `scripts/finalize-models.mjs`（合併＋Draco → `public/models/{id}.glb`，目標 <500KB）；有手持武器嘅角色一律行 Tripo 全管線
- **2D 立繪（每隻要兩個檔）**：`scripts/cutout-art.mjs` 出透明全身 `public/spirits/full/{id}.webp`（battle／剪影用）＋ `scripts/process-art.mjs --from-full {id}` 出 cream 底 icon `public/spirits/{id}.webp`（**圖鑑 SpiritIcon 已捕獲讀呢個，缺就爛圖**）；管線 `art.mjs` 兩個一齊出
  - **畫風對齊**：生成前必須先睇 3–4 張現有立繪（例如 `public/spirits/full/oily-rice-chick.webp`、`little-laksa.webp`、`tutu-sprite.webp`）——Q 版食物擬人、大眼、圓潤造型、卡通厚塗、正面偏 3/4 視角、全身企姿
  - **生成圖要求**（`cutout-art.mjs` 係四角 flood-fill 去背、色差容忍只有 13）：單一純色平坦背景（揀同精靈主色有對比嘅淺色，例如淺藍／淺綠，唔好米白配白色精靈）、精靈完整置中、四邊留空唔掂圖邊、無陰影無漸變無紋理
  - **來源檔位置**：PNG 存去 `C:/Users/user/.cursor/projects/c-Users-user-hawker-hunt/assets/{species-id}.png`（script 寫死讀呢度）
  - **名單寫死**：`cutout-art.mjs` 頂部 `SPIRITS` 陣列要手動加新 id（只加唔刪）；輸出自動 640×640 透明底 webp
  - 每完成一個系列（3 張）spot-check 去背效果，確認冇蝕爛先繼續落一批
- **UI icon**：`public/ui/*.webp`，經 `scripts/cutout-icons.mjs`
- **音樂**：`scripts/gen-music.mjs`（ElevenLabs）→ `public/music/`
- **切磋背景**：`scripts/make-battle-bg.mjs` → `public/battle-bg/{centreId}.webp`

## 多視窗平行開工規則

- 開工前講明自己範圍，**唔好掂範圍外嘅檔案**；內容生產（content/＋素材）同功能開發（app/＋components/＋lib/）係天然分界
- 兩個視窗都要改同一個檔案嘅任務：唔好平行做，排隊或者用 git branch 隔離
- 新增內容係「加」唔係「改」：加精靈唔應該改動現有 15 隻嘅數據
