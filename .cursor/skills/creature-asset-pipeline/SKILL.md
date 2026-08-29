---
name: creature-asset-pipeline
description: >-
  Portable playbook for shipping playable 3D collectible/battle creatures:
  concept → style-locked 2D art → Tripo/Meshy 3D + rig → facing-lock →
  playability gates (approve = app-ready). Use when building or adapting a
  creature/pet/spirit content pipeline in any game app, extracting this
  workflow for outsourcing, or wiring a new theme/schema adapter.
---

# Creature Asset Pipeline（可攜 Playbook）

由 Hawker Hunt 實戰沉澱嘅**通用**出貨系統。目標一句話：

> **Approve / go-live = App-playable**（真 GLB、面向鎖定、技能／立繪齊，唔係「概念通過」）

呢份係 **Universal**。具體 repo 路徑、schema、主題文案 → 見 `adapters/`（例如 Hawker）。

## 何時用呢份 skill

- 新 app 要「由 IP／主題概念 → 可上線 3D 角色」
- 外包／第二產品想複用決策樹同驗收閘，唔想抄 Hawker 五行小販 schema
- 收斂 credits、防武器消失、防切磋面向錯、防「審過但冇得打」

## 0. 接入新 app（最少步驟）

1. 複製本資料夾去目標專案 `.cursor/skills/creature-asset-pipeline/`（或個人 `~/.cursor/skills/`）
2. 新建 `adapters/<app-name>.md`：填 schema、路徑、畫風 DNA、技能上限、審批通道
3. 對照 §7 閘門清單，用現有 script 或手寫同等檢查
4. **唔好**假設 `species.ts`／`modelYaw`／Telegram 一定存在——全部由 adapter 定義

## 1. 端到端階段（產品閉環）

| 階段 | 產出 | 失敗時 |
|---|---|---|
| Concept | 系列／階、名、技能点子、形態（body plan） | 唔寫內容檔 |
| Art | 透明全身立繪 + icon（若 UI 要） | 唔入 3D |
| Model3D | 保留武器嘅網格（通常 Tripo） | 報預算後先重試 |
| Rig | fullRig（Meshy）或 rigLite（Tripo）或 static | 見 §3 決策樹 |
| Finalize | 壓縮 GLB、寫入 content flags | — |
| Facing | 校準 `modelYaw` + lock 註解／紀錄 | **唔准**當完成 |
| Playability gate | GLB + art + facing + skill cap | 狀態退回，唔好假 approve |
| Publish | 合併／部署 | CI／tsc／閘全過 |

營運可加：Telegram／admin 審批、Supabase draft、GitHub `repository_dispatch`——屬 **Host 層**，唔係核心 playbook 必備。

## 2. 立繪鐵律（省 credits 最大槓桿）

### Rig-friendly 企姿

- 雙臂明顯離軀幹（腋下見背景），近 A-pose
- 武器**垂直／斜向側揸**，伸出輪廓；**禁**橫抱胸／腹／腿
- 雙腳分開企直；頭身輪廓清晰

### 面形

- 臉清晰正面（或極輕微 3/4）、大眼對稱、唔好俾帽／武器遮
- 3D「溶面」根源喺 2D——修立繪重生成，唔好狂重跑 rig

### 去背友善

- 單一純色平坦背景、主體置中留邊
- 「無陰影／無漸變」**只限背景**——prompt 要加 scope，唔好壓平角色厚塗

### 主題融合（食物／IP／物料）

- 主題元素要「長喺身上／變成裝備」，唔好「手捧整件道具交差」
- 禁飄浮碎屑當永久幾何（留給戰鬥 VFX）

### 進化階（若有多階）

- 低階→中階：成長；**高階允許剪影轉生**（新 archetype），只靠配色／motif／樣貌維繫族感
- 唔好成套默認「有翼有光環天使」——用**輪替 archetype 庫**

### 畫風錨

- Style refs **按階**（baby／warrior／boss），唔好全程只用幼體圖
- 畫風段放 prompt **最前**、最高優先

## 3. 3D／Rig 決策樹（通用）

```
立繪開揚企姿？
├─ 是 → Tripo 生成（保武器）→（常要）rotate 對齊 Meshy 正面
│         → Meshy rig？
│            ├─ 過 → fullRig（真骨骼動畫）
│            └─ 422 → 再開臂重畫／再試 → 仍敗 → Tripo rig（lite）
├─ 否、又唔想重畫 → Tripo → Tripo rig（lite）或 static
└─ 圓身／無四肢 blob → Tripo 靜態 + 程序化 idle／攻擊托底
```

硬知識：

- **Meshy 文字／圖生 3D 嘅 a-pose 會食走手持武器** → 有武器角色唔好行 Meshy 生成
- Meshy **rig** 可以吃 Tripo 網格；422 拒通常**唔收費**，可當免費試錯
- Tripo root motion 會打戰鬥 `lookAt` → lite rig 必須 strip root（或等價）
- 長裙／搵唔到腳／非直立輪廓 → 唔好硬上 Meshy fullRig
- 生成前**報 credits 預算**；完工報實際消耗

## 4. Facing-lock（戰鬥對稱）

假設戰鬥：鏡頭喺玩家後方、敵人在對面、`lookAt` 對稱。

| 位 | 必須 |
|---|---|
| 玩家 | **背向鏡頭**、軀幹對敵（判軀幹，唔判頭／尾／翼） |
| 敵 | **面向**玩家／鏡頭（眼／喙／胸口標記） |

鐵律：

- 同一 yaw 必須兩邊啱；**禁止**敵位專用 flip／改站位遷就單隻
- 有效 yaw 通常只有：`0`｜`±π/2`｜`π`（按專案定義）
- Pipeline 預設 yaw **只係起點**——必須截圖校準後先 lock
- 換 GLB／重 rig／finalize → lock 失效，要重校
- 大尾／大翼正面易似背——用正面特徵判，唔好靠剪影

建議工具形狀（名可改）：四檔 yaw ×（玩家＋敵）截圖 → 人選 → 寫入 content + `facing-lock` 標記 → audit。

## 5. 可玩硬閘（Approve = Playable）

上線前每隻／每階至少：

1. 真 GLB 存在（唔係 mock／占位 URL）
2. UI 需要嘅立繪／icon 齊
3. Facing 已 verified lock（唔接受「pipeline default — verify」）
4. 特殊技數量 ≤ 專案上限（Hawker **暫時 2 招**，普攻另計；治療佔其中一格）
5. Content schema 通過 typecheck／靜態檢查

**禁止：** 後台寫 DB、publish 讀未同步嘅 git draft → 脫節（要 hydrate 或單一真相來源）。  
**禁止：** CI 依賴未 commit 嘅本機 script。

## 6. 技能設計（可配置）

- Adapter 定義 `MAX_SKILLS_PER_STAGE`（Hawker 暫時 = 2）
- 治療／護盾 **佔上限格子**，禁止「N 攻 + 再 append 治療」
- 數值用 deterministic 範本；LLM 只補文案（防失衡）

## 7. 驗收清單（每隻出貨）

- [ ] 立繪：企姿／面形／去背／主題融合
- [ ] GLB：武器在手、企穩、體積合理、無垃圾幾何
- [ ] Flags：`animated`／lite／static 同骨架一致
- [ ] Facing：玩家背 + 敵面（Read 截圖，唔好只信腳本 ok）
- [ ] Skills ≤ cap；特效 id 對得上
- [ ] Playability gate 綠；部署後真機／diag 抽樣

詳見 [reference-gates.md](reference-gates.md)。

## 8. 同 Hawker 專案 skill 分工

| 文件 | 職責 |
|---|---|
| **本 skill** | 通用決策、閘、可攜流程 |
| `adapters/hawker-hunt.md` | Hawker 路徑／schema／指令 |
| 專案內 `spirit-asset-pipeline` | Hawker 實作細節、prompt 檔案級說明 |
| 專案內 `spirit-3d-models` | GLB／SpiritModel／facing 指令細節 |
| 專案內 `gameplay-loop-tuning` | 捕捉／能量／手感（非素材管線核心） |

改通用鐵律 → 改本 skill；改 Hawker 路徑 → 改 adapter／專案 skill。

## 9. 外包／授權用法

交俾外包或第二 app 時最少交：

1. 本資料夾（`SKILL.md` + `reference-gates.md` + 一個 adapter 範本）
2. 畫風參考圖 4–8 張（按階）
3. Adapter 已填：輸出路徑、skill cap、facing 規則、vendor keys 邊度讀
4. 「Done」定義 = §7 清單全勾，唔係「圖靚」

第二個 app 驗證標準：80% 只改 adapter＋畫風 DNA，唔改本 playbook 正文。
