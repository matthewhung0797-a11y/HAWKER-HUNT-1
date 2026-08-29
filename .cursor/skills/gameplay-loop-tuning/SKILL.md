---
name: gameplay-loop-tuning
description: >-
  捕捉／小遊戲 raf loop 嘅手感調校、輸入機制改動（按住→狂撳呢類）、
  難度數值平衡（含切磋技能能量分檔）、新手導覽設計、自拍／成功畫面展示，
  以及互動機制嘅 Playwright 診斷技巧。
  改 capture/battle loop 數值、改輸入方式、加教學關卡、調技能能量／展示尺寸、
  或者診斷「事件冇觸發／手感太易太難」問題時使用。
---

# Gameplay loop tuning（手感調校＋互動診斷）

呢啲全部係真實踩過嘅坑（2026-07 捕捉改狂撳＋新手導覽＋UI 統一嗰輪）。

## UI 字型：粉圓體子集過期＝「字體唔一致」假象

- 全站 `font-family` 已統一 `openhuninn`，但載入嘅係**子集** woff2。
  子集冇嘅字會 fallback 去 Noto——同一個名入面「卜」變粗、「史詩級」似另一隻字，
  **唔係** CSS 寫漏，係 `public/fonts/openhuninn-subset.woff2` 過期
- 修法：本機有 `jf-openhuninn.ttf` 時跑 `node scripts/build-font.mjs`，commit 新 woff2
- 名（`font-bold`／700）同稀有度（400／更細字）睇落唔同粗幼係**層級設計**，
  `getComputedStyle` 兩邊都係 openhuninn 就唔好當 bug
- 真機／Playwright 驗證前要留意瀏覽器 cache；diag 用全新 browser context

## 改輸入機制／數值前：先計條時間軸

改 fill rate、起手值、drain 任何一樣，都要對齊**成場戲嘅事件排程**先郁手：

- 搏鬥時長 ≈ `(100 − 起手 GRADE_GRIP) / (每秒淨升幅)`，淨升幅 = 補充速率 − `GRIP_DRAIN`
- 對比第一波狂暴時間 `gap() × 首波倍率`、last-stand 門檻 grip
- **真實案例**：狂撳版初調 55/s 封頂 → common 約 1.2s 就捉到，而第一波狂暴要 1.8–2.9s
  先發作 → 玩家「按咗幾隻都冇狂暴」。狂暴機制根本冇壞，係**捉得太快等唔到佢發作**。
  修法係封頂降到 42＋首波提早（×0.7→×0.55），令搏鬥 ~2s、狂暴趕得切出場
- 教訓：玩家報告「某機制消失咗」，先驗排程時間軸，唔好急住去搵機制本身嘅 bug

## 狂撳類輸入必須有「每秒封頂」（漏桶）

- 每撳 +N 冇上限 = 快手／autoclicker 秒殺（機械 20–50 撳/秒 vs 人手 5–8 撳/秒）
- 漏桶寫法：`used = max(0, used − capPerSec×dt)` 每 frame 回補配額；
  加分時 `give = min(want, capPerSec − used)`。噉樣難度同「按住每秒 X」完全等價
- 測試腳本狂撳速度遠超人手，**手感結論要折算**：diag 覺得「太易」可能只係機械速假象

## raf loop「先流失後檢查」陷阱（完成判定擺位）

- event handler 加分加到啱啱 100，loop 下一 frame **先 drain 再 check `>=100`** →
  永遠變返 99.x，完成條件永遠唔成立（教學 mash 實際發生過，卡死喺 caught 前）
- 修法：**完成判定要喺加分嗰一刻（handler 入面）做**，loop 只負責流失同失敗判定

## effect 內有 local timer 就唔好依賴 transient state

- `useEffect(..., [scene, frenzy])` 入面用 local `frenzyUntil`：frenzy 一 set state →
  effect restart → timer 歸零 → 狂暴得一 frame 就完
- 修法：deadline 用 ref（`frenzyUntilRef`），effect 只依賴 scene；
  loop 入面對同值 `setState(false)` React 會 bail out，唔會爆 render
- 呢個係 AGENTS「React 閉包陷阱」嘅延伸：timer/deadline 一律 ref

## 展示位（成功畫面／showcase）要做「顯示歸一化」

- `SpiritModel` 按真實身高 `modelHeightM` render——世界場景啱，但 showcase 會令
  細隻 baby（例如 chilli-crablet 0.28m）變一嚿豆
- 修法：wrap 一層 `<group scale={目標顯示高 / modelHeightM}>`，位置按目標高調返
- **目標顯示高而家係 0.55m、容器 `h-52 w-52`**（以前 0.85m／`h-72`）：矮肥寵
  （煎蕊仔）會頂到「捕捉成功」標題同資料卡。調大細記得 3D scale、`<group>` y、
  2D fallback `h-*`、相機 position **四樣一齊改**，唔好淨改一個

## 新精靈特殊技暫時最多兩招（普攻另計）

- **上限 2**：`species.skills.length ≤ 2`（治療／護盾計入）。唔好再出第三招
- 根因（2026-07）：管線舊邏輯 `ideas.slice(0,2)` 做兩攻後，再因「護／heal」**append**
  治療 → 雲吞麵將軍三招。而家 `stages/skills.mjs` 治療佔兩格之一；
  `checkPlayability` 超限拒 publish
- 設計／concept 嘅 `skillIdeas` 每階最多兩條；放寬要改 `lib/skill-limits.mjs`、
  playability、同 `.cursor/skills/spirit-asset-pipeline/SKILL.md`

## 切磋技能能量必須跟威力分檔（唔可以二元）

- `skillCost` **唔可以**淨係 `power≥1.8 → 100 / 其餘 → 50`：stage 2 典型係
  ×1.3＋×1.6 兩個技，二元檔令兩個都顯示「能量 50」→ 玩家永遠只撳強技，弱技廢咗
- 能量由 `battle/page.tsx` 嘅 `skillCost(skill)` **運行時**計——改一處就全寵物生效，
  **唔使**改 `species.ts` 每隻嘅 cooldown／另加 cost 欄位
- 現行分檔（同 `BASIC_ENERGY=35` 對齊，方便心算「幾下普攻」）：
  - 治療／輔助（`power≤0`）→ 50
  - 弱技（`<1.25`，約 ×1.0）→ 35（一下普攻）
  - 輕中技（`1.25–1.55`，×1.3～×1.5）→ 50
  - 強中技（`1.55–1.8`，×1.6～×1.7）→ 70（約兩下普攻）
  - 大招（`≥1.8`）→ 100
- 加新威力區間／改數值前：先 `species.ts` 掃晒現有 `power:` 分佈，確認唔會令
  某檔空咗或者兩個檔撞埋一齊；UI 文案係 `能量 {cost} ・ ×{power}`，cost 同 power
  並列，玩家一眼睇到取捨

## 自拍 ≠ 捕捉 AR——前置鏡冇 SLAM，要靠假陰影騙眼

- 捕捉有四層：`slam` → `gyro` → `3d` → `static`；自拍（`SelfiePhoto`）**只有**
  陀螺儀世界錨定 或 螢幕拖動——**冇** `Xr8Layer`／平面 hit-test
- 前置鏡頭技術上做唔到 8th Wall SLAM（只支援後置）。用戶投訴「有陀螺儀但寵物
  冇踩實平面」＝正常：錨點係估嘅高度，唔係偵測到嘅地面
- 最小有效修法（`shadow_only`）：`SelfieSpirit3d` 加**獨立**接地陰影 mesh
  （sibling，唔入寵物 group——唔可以跟彈跳升降），騰空愈高愈淡；
  gyro 路徑用相機俯仰＋假設手持高度（`SELFIE_HOLD_H`）推地面 Y；
  螢幕錨定路徑用壓扁橢圓做腳下影。影相靠 `preserveDrawingBuffer: true` 會一齊入相
- 開自拍權限一定要喺掣嘅 onClick（見下一節）
- **「再影」黑屏陷阱**：影完相唔可以 `shot ? <img> : <video>` 互換——`<video>` unmount
  會甩走 `srcObject`，而開鏡 `useEffect` 只依賴 `facing`，再影 `setShot(null)`
  唔會重跑 → 新 video 冇 stream＝全黑底（精靈 Canvas 仲喺）。修法：video **一直 mount**，
  shot 時用 `invisible` 藏住＋`<img>` 疊上面；再影時 `video.play()` kick 一次

## Playwright 測自拍再影

- 流程：`__cap.openSelfie(false)` → `selfie-shot` → 再影掣 → assert `video.srcObject`
  仍然有 track 而且 `video` 元素冇被換成新 node（同一 ref）
- fake media flags 底下背景可能係綠／圖案，重點係**唔可以係純黑＋video 冇 srcObject**

## iOS 陀螺儀權限：一定要喺 user gesture 入面 request

- `DeviceOrientationEvent.requestPermission()` 喺 overlay mount 後嘅 useEffect 叫會被拒
- 修法：喺開啟嗰個掣嘅 onClick 入面 `await requestGyroPermission()` 先 set state 開 overlay
- 冇讀數（desktop／被拒）必須 graceful fallback（世界錨定退返螢幕錨定），
  gyro branch 用 `worldAnchorRef.current === null` 做開關就自然有 fallback

## Playwright 診斷互動機制（補 AGENTS 驗證流程）

- **搖擺／掙扎動畫嘅元素 `.click()` 必 flaky**（actionability stability check 過唔到）：
  用 `locator.dispatchEvent("click")`（React onClick 食到），唔使等 stable
- handler 要讀 `clientX/clientY` 嘅（撳中判定）：`locator.dispatchEvent` 冇座標，
  要 `page.evaluate` 派 `new PointerEvent("pointerdown", {clientX, clientY, pointerId, pointerType, bubbles:true})`
- 時機類小遊戲（縮圈）：喺 element 上每 frame 寫 `el.dataset.s`，diag 喺 browser 入面
  `requestAnimationFrame` 等到貼位先 click——喺 node 側 poll 有往返延遲，必夾空
- 測自拍／相機 UI：launch 加 `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`
  ＋ context `permissions:["camera"]`，唔係就行入 denied 分支，主 UI 根本唔 render
- capture 頁 `window.__cap` debug hook 要 `?debug=1` 或 `?ls=` 先有；
  `?ls=charge` 順便令第一 clamp 保證入搏鬥（唔使賭縮圈時機）
- `__cap` 係 callable（`__cap()` 讀狀態）兼有方法：`__cap.showSuccess()` 直入成功畫面、
  `__cap.openSelfie(gyro?)` 直入自拍——驗證展示尺寸／陰影時用，**唔好賭成場捕捉 loop**
- **睇到 `track: x:0 y:0 on:N` 唔代表精靈行咗出鏡，多數係「report 從未 fire」**：
  `track` 初始值就係 `{x:0,y:0,inFront:true,onScreen:false}`，`WanderingSpirit` 卡喺
  Suspense（GLB＋gstatic draco decoder 要 ~1.5s）期間 `useFrame` 未跑過，一個 report 都冇。
  分辨方法：`onTrack` fire 過先算登場（`tracked` flag），或者 diag 睇 network 有冇 200 GLB
- 3D 場景相機**唔喺原點**（`CaptureStage3d` 擺喺 `(0,1.0,1.6)` 望向 `(0,0.38,-0.7)`），
  所以 debug overlay 個 `pose:` 行（XR8 pose，`has:false` 即無效）唔可以當相機位讀
- **測 battle／capture 時要擋 Supabase**：`page.route("**/*supabase*/**", r => r.abort())`
  （同 auth），唔係 `CloudSaveInit` 可能用 anon session pull 洗走 `addInitScript`
  預填嘅 `ownedSpirits`，畫面變「你仲未有精靈」假陰性

## 「未登場」唔可以當「出鏡」——UI 提示要有登場閘

- 任何靠每 frame 回報位置嘅提示（離幕箭嘴、「跟箭嘴搵返佢」、瞄準圈）都要先確認
  模型真嘅登場過，否則入場頭一兩秒模型仲載入中就會彈假警報，玩家一入場就見到
  「精靈走咗出鏡」——實測係入場觀感最差嘅 bug
- 入場手感：AI 初始 mode 用 `peek`（企定錨點望鏡頭）1.5s 先開始遊走，
  而唔係一 mount 就數 idle timer——timer 由第一個 frame 開始跑，即係「模型一出現就已經行開」
- 重新錨定（gyro 首次讀數／slam 搵到平面）等於重新入場，`home` 之外仲要 reset `mode`／`timer`
- 遊走範圍用投影 `|p.x| < 0.55`（唔好 0.76）：0.76 容許精靈貼到畫面 88% 位置，
  睇落唔似「喺你面前」；0.55 仍然有走動感但一直留喺中央

## 新手導覽設計原則（研究過先郁手）

- **唔好靜態幻燈片＋文字牆**——手遊 onboarding 共識係 learn-by-doing：
  一次教一個機制 → 即場試 → 加個小變化（teach-test-twist）
- 導師角色用現成精靈（骨茶宗師教「筷子功」），對話泡泡＋打字機，貼世界觀
- 教學實習**唔可以輸**（gauge 落下限、夾空俾佢重試），完成即慶祝（即時獎勵）
- 全程 Skip；完成寫 `completeOnboarding()` 先跳走
- 全部用現成素材（立繪／sfx／CSS class），零新資產成本

## 筷子經濟／捕捉定位／圖鑑（2026-07 產品決策）

- **打卡獎勵**：1 件據點／spawn 相關材料 ＋ **20 筷子**（`chopsticks` item）
- **筷子消耗**：入搏鬥（struggle）起手 −1；失敗唔退；0 筷 → 擋捕捉＋引導去打卡
- **捕捉 `?centre=`**：淨控制 spawn pool；畫面據點名只喺 GPS ≤ 200m 嗰個據點先顯示
- **自拍**：3D 手動左右拖＋縮放，**唔用**陀螺儀做主操控
- **圖鑑卡**：列表可留 640 full，靠離屏延遲減卡；詳情 2D 先、3D 可開
  （細節見 `spirit-asset-pipeline` §5b）
