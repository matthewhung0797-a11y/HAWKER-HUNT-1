---
name: spirit-asset-pipeline
description: >-
  Hawker Hunt 精靈內容擴充同素材生產嘅完整工作流：species/items/skill-fx/centres
  內容寫入、2D 立繪生成去背、3D 模型生成／rig／動畫／finalize、朝向同武器驗證。
  新增精靈系列、生成 2D 立繪、行 gen-3d / tripo-rig-animate / finalize-models、
  處理 model-pipeline 任務檔、或者遇到 3D 模型武器消失／朝向錯誤問題時使用。
---

# 精靈素材管線（內容 → 2D → 3D）

> **可攜通用版**：`.cursor/skills/creature-asset-pipeline/SKILL.md`  
> **本檔**＝Hawker 實作細節；接線表見 `creature-asset-pipeline/adapters/hawker-hunt.md`。  
> 其他 app／外包：複製 `creature-asset-pipeline/` 資料夾，用 `_template.md` 開 adapter。

由實戰沉澱：15 個系列（45 隻）擴充＋15 隻 3D 武器修復＋12 隻立繪重畫嘅經驗。
核心結論一句講晒：**立繪一開始就畫「開揚企姿＋正面對稱臉＋一體化武裝（空手）」**，
全骨動畫先穩——獨立手持長武器（棍／鏟／串）Meshy skinning 幾乎必拉爛。
攻擊靠身體部位（鉗／甲刃／角／掌刃）；一階要有 seed motif。細節見
`scripts/pipeline/lib/style-prompt.mjs`（`INTEGRATED_ARMAMENT`／`FACE_RULES`／
`BODY_PLANS` 含 `plant-kin`／`fungus-spore`）。重畫用 `remake-hq-art.mjs` 嘅
`SERIES_PROFILE` 按系列鎖 bodyPlan＋mythic，**禁止**一律 `humanoid-chef`。

## 1. 內容擴充流程

執行順序（每步完成先落一步）：

1. 設計清單出俾用戶確認（名／五行五味／技能／進化材料），確認前唔准寫檔
2. `src/content/species.ts`：`modelUrl: null` 先行（SpiritModel 自動用 2D sprite 降級）
3. `src/content/items.ts` → `src/content/skill-fx.ts` → `src/content/centres.ts` spawnPool
4. `npx tsc --noEmit` 零錯誤

鐵律：

- 只「加」唔「改」：現有精靈／道具／特效數據一律唔郁
- 一階全部 `rarity: "common"`；spawnPool 只列一階（野生二階由 `src/lib/spawn.ts` 自動處理）
- id 一律 ASCII kebab-case
- **每階特殊技暫時最多 2 招**（普攻另計；含治療／護體）。`skillIdeas` 只寫最多 2 條；
  治療類 idea 佔其中一格，**禁止**「兩攻 + 再 append 治療」變三招
  （2026-07 雲吞麵將軍踩過）。管線：`stages/skills.mjs` + `lib/skill-limits.mjs`；
  publish 閘：`checkPlayability` 超限會拒。人手寫 `species.ts`／`skill-fx.ts` 同樣遵守；
  放寬上限要同步改三處 + 本條

### 1b. 命名規則（防「·別名」復發）

- 顯示名必須係**單一稱號**：中文 2–5 字、英文 1–4 詞。**禁止**間隔號＋第二個別名
  （`叻沙龍·辛焱`、`Kopi O Emperor Yenong` 呢類——玩家投訴後已全庫剪走）
- 詩意別名擺去**技能名**（`skillIdeas`／`skills[].name`），唔好擺落寵物 `name`
- 系統二：`scripts/pipeline/lib/style-prompt.mjs` 已有 `NAME_RULES` 注入
  `buildConceptPrompt`；唯一性清單（`existing.names`）上面必須註明
  「只係避撞名，唔係命名範本」——唔加呢句，LLM 會照抄舊格式再出 `·XX`
- 人手／publish 寫入 `species.ts` 前掃一次：`zh` 有冇 `·‧•・`，`en` 有冇音譯尾巴
- **加完中文名一定要 `node scripts/build-font.mjs`**：粉圓體係子集 woff2，缺字會 fallback
  去 Noto——同一個「咖喱卜尊」入面「卜」變粗就係子集過期（2026-07 實測）。
  要本機有 `jf-openhuninn.ttf`；publish CI 若會改名，記得喺 workflow 加呢步或提醒人手 rebuild 後 commit `public/fonts/openhuninn-subset.woff2`

## 2. 2D 立繪生成

- 生成前**必須**先用 Read 睇 3–4 張現有立繪（`public/spirits/full/`）對齊畫風：
  Q 版食物擬人、大眼、圓潤、卡通厚塗、正面偏 3/4 視角、全身企姿
- **Rig-friendly 企姿準則（鐵律，所有新立繪一律遵守）**：
  - 雙臂明顯離開軀幹（腋下見到背景），近 A-pose 但保留角色性格
  - 武器揸喺身側、伸出身體輪廓之外；**嚴禁**武器橫抱胸前／遮住軀幹
  - 雙腳分開企直，頭身輪廓清晰可辨
  - 點解：Meshy rig 嘅 pose estimation 靠輪廓認人形——手臂黐身／武器遮身
    會 422 即拒（實測 12 隻武器攬胸嘅全滅，蠔煎武士／咖喱卜武士企姿開揚就過）；
    一開始畫啱姿勢，就唔使事後重畫立繪＋重生成 3D 返工
- **面形準則（鐵律，防 3D 面形扭曲）**：2D 立繪嘅**臉一定要清晰正面（或極輕微 3/4）、
  雙眼大而對稱、五官唔可以俾帽／道具／武器／陰影遮住**，臉要完整入鏡。點解：Tripo／Meshy
  由 2D 重建 3D 面形——原圖臉側到／半遮／糊，3D 就會出「溶面／五官歪／眼歪」（以前踩過）。
  water-粿系三階面形靚，正因為三張原圖都係大眼、正面、臉無遮擋。**面形問題根源喺 2D，唔喺 rig**：
  面歪要修返 2D 正面臉重生成，唔好靠重跑 rig（嘥 credits 又救唔到）。
- `scripts/cutout-art.mjs` 係四角 flood-fill 去背（色差容忍 13），生成圖要求：
  - 單一純色平坦背景，揀同精靈主色**有對比**嘅淺色（白色精靈唔好配米白底）
  - 精靈完整置中、四邊留空唔掂圖邊、無陰影無漸變
- 來源 PNG 位置寫死：`C:/Users/user/.cursor/projects/c-Users-user-hawker-hunt/assets/{id}.png`
- script 頂部 `SPIRITS` 陣列要手動加新 id（只加唔刪）；輸出 640×640 透明 webp
- 每完成一個系列（3 張）即刻 spot-check 去背效果先繼續
- **⚠️ 每隻精靈要兩個 2D 檔，唔好淨生成一個**（2026-07 踩過：管線只出 `full/` → 圖鑑爛圖）：
  - `public/spirits/full/{id}.webp` — 透明底全身（battle／capture／`SpiritModel` sprite／
    **圖鑑 `SpiritIcon` 而家一律讀呢個＋`object-contain`**，已捕獲同剪影都要全身入框）
  - `public/spirits/{id}.webp` — cream `#F2E7CF` 底 512² icon（地圖徽章以外嘅舊路徑／
    其他可能引用；管線仍要出，唔好省）
  - 手工流程：`cutout-art.mjs`（出 full）＋ `process-art.mjs --from-full {id}`（由 full 合成 icon）
  - 管線流程：`stages/art.mjs` 去背後即刻叫 `iconFromFullWebp()`（`lib/cutout.mjs`）出埋 icon；
    生成 workflow 要 `git add public/spirits`（連 top-level icon），唔好淨 add `public/spirits/full`

### 2b. 系統二自動立繪：質感／統一度調校（2026-07 踩過）

自動生成（Gemini `gemini-3.1-flash-image`）出嘅立繪比舊人手圖「平、唔立體、唔統一」，根因唔係模型差，係 `lib/style-prompt.mjs` 條 prompt 設計，三個位一齊整死質感：

- **畫風錨全部係一階 baby**：舊 `STYLE_REF_IMAGES` 四張都係圓潤幼體，生 stage 2/3 見唔到「高細節示範」就愈生愈簡化。
  → 改成**按階配對** `STYLE_REF_BY_STAGE`（`styleRefsForStage(stage)`）：stage 1 用 baby 錨、stage 2 用戰士錨（`crab-claw-warrior`／`satay-warrior`／`bkt-warrior`）、stage 3 用 boss 錨（`chilli-crab-king`／`satay-flame-emperor`／`kopi-o-emperor`）。`art.mjs` 喺 loop 內按 `st.stage` 攞錨。
- **背景負面詞滲入角色**：`BG_RULES` 嘅「no shadow / no gradient / no texture」本意淨係管背景（方便 flood-fill 去背），但生圖模型會套落成張圖壓平角色 shading。
  → `buildArtPrompt` 背景行後面**明加 SCOPE NOTE**：呢啲限制只針對背景，角色一定要保留厚塗 shading／高光／內部陰影／3D 體積。
- **畫風權重被 rig/背景約束溝淡**：`RIG_STANCE`＋`NEGATIVE_STANCE` 成百幾字大寫 MUST/AVOID，畫風得一行夾中間。
  → 畫風段（`STYLE_DNA`）**升做最高優先、擺 prompt 最前**，並喺 `STYLE_DNA` 補質感詞（layered brushwork、rim light、glossy specular、food-material rendering、high detail density、3D volume、dramatic lighting）。

一句總結：**畫風錨要按階、背景限制要 scope 落背景、畫風段要放最前**。純 prompt/config 改動零新架構；仲平嘅話可加「生完 Gemini vision 評分＋retry」或 stage 3 boss 圖改 pro 級 `GEMINI_IMAGE_MODEL`。

### 2c. 食物融合 + 武器/粒子 rig 陷阱（2026-07 再踩過）

睇到二階「冇創意」＝生圖模型偷懶：主體照畫隻靚動物，然後**擺碟真食物落胸前／手上**交差（food accessory）。呢個同時係 rig 殺手（碟嘢橫身前＝Meshy 422）。舊圖之所以正，係因為食物係「長喺身上」（food embodiment）。三個 prompt 修法（全喺 `lib/style-prompt.mjs`）：

- **食物融合鐵律** `FOOD_EMBODIMENT`（放 `buildArtPrompt` 畫風段之後）：菜式必須「起」入角色本體同裝備（盔甲＝米粿板塊、肩甲＝蒸籠、披風＝醬汁、頭盔＝碗），**嚴禁把整碟／整碗完整菜式當道具攞喺手或掛胸前**。配合 `STAGE_BRIEF` 二、三階由「gains gear」改成「裝備由食材／器具轉化（唔係普通金屬甲、唔係手捧食物）」。
- **武器位置**：`RIG_STANCE` 加明武器要**垂直或斜向側揸、離開身體**，**嚴禁橫過胸／腹／腿或者塞住兩腿之間**（沙嗲武士側揸番作範本）。`NEGATIVE_STANCE` 同步加「橫身前／腹／腿嘅道具」「手捧／胸掛整碟食物」。
- **飄浮粒子**：生圖成日喺角色四周畫飄浮花瓣／醬汁碎片／碎屑，**3D 生成會照起呢啲游離幾何變垃圾**。`NEGATIVE_STANCE` 明禁 floating food particles/droplets/crumbs/debris——呢啲效果留返俾 battle 入面 `BattleFx` 粒子做，唔好畫死喺立繪。

實測（水粿 beast-kin A/B）：改完二階由「捧碟菜脯」變「蒸籠肩甲＋菜脯嵌甲＋木鏟直立側揸」，三階金鑊鏟由斜跨雙腿變垂直側揸、飄浮碎片幾乎清走——rig 友善度明顯貼近圖 1 上到 fullRig 嗰批。

### 2d. 三階「轉生」配方——archetype 跳變（2026-07 再踩過）

自動生成嘅二、三階「一模一樣」（同一隻動物，盔甲金啲武器大啲）——因為 prompt 有三重鎖鏈：`evo` 句叫「keep the SAME silhouette DNA」＋三階餵二階圖 ref 叫「Match the previous stage's identity」＋concept 逼三階共用 bodyPlan。而**手工年代嘅成功配方係「三階唔係升級，係轉生」**：武士→龍/鳳/帝/神/后（咖央聖龍、沙嗲炎帝、煎餅天象、珍多雪后），剪影徹底改變，只靠配色＋食物 motif＋樣貌維繫族感。有翼有冠完全唔影響 rig（沙嗲炎帝/咖央聖龍都係 fullRig），直立雙足四肢清晰就得。修法（全喺 `lib/style-prompt.mjs`）：

- `evo` 句**按階分工**：1→2 keep 樣貌成長；3 階只 keep 配色＋motif＋樣貌，**必須 DRAMATIC transformation／new silhouette class**，prior-ref 指令反轉成「evolve FAR beyond it，嚴禁抄裝束姿勢武器」
- `STAGE_BRIEF[3]` 改「REBORN as legendary being（dragon/phoenix/deity/emperor…），翼／多尾／冠／光環／披風鼓勵，但保持直立雙足」
- `buildConceptPrompt` bodyPlan **只鎖一、二階**，三階明文要求 archetype 跳變＋**每階武器唔可以重複**

實測：水粿三階由「金甲倉鼠揸鑊鏟 v2」變「蒸氣雙翼＋光環＋蒸籠皇冠＋三叉戟嘅蒸氣神將」，同二階剪影完全分開，仍然 rig-friendly。

**⚠️ 但「轉生」唔等於「隻隻天使」（2026-07 用戶回饋）**：舊 prompt 三處（`STAGE_BRIEF[3]`／`evo`／`bodyPlanLine`）都硬列「wings / halo / floating aura / cape」，LLM 見到重複提示就默認畫**有翼有光環嘅天使**——水粿大將正正就係。單隻靚，但**成套 final 都係天使＝冇新意、通用晒**。修法：`lib/style-prompt.mjs` 加咗 `MYTHIC_ARCHETYPES` 原型庫（war-general／emperor／celestial／dragon-sovereign／many-armed-deity／yokai-warlord／beast-king／elemental-titan），`concept.mjs` `chooseMythicArchetype()` **逐隻輪替抽一個唔同終形**（roster 基準＋id hash＋避開最近一隻），寫入 `draft.family.mythicArchetype` 再餵 prompt。「翼＋光環」淨係 `celestial` 一個選項，唔再係全體默認。三處 prompt 都改成「commit to the family's chosen archetype，唔好默認天使」。**每個原型都保持直立雙足四肢清晰 → 照樣上 Meshy fullRig。**

## 3. 3D 管線決策樹

```
立繪係咪開揚企姿（手臂離軀幹、武器伸出輪廓）？
├── 係（新立繪應該一律係）
│     → Tripo 生成（gen-3d.mjs --backend=tripo，保武器）
│     → **焗入 -90° yaw**（rotate-glb.mjs，Tripo 正面 +X → Meshy 要 +Z 先認到人形）
│     → Meshy rig（rig-animate.mjs --src=tripo，24 骨全動畫）
│       ├── 過 → finalize → species.ts：animated: true ＋ modelYaw: Math.PI / 2
│       │   （Meshy rig 轉咗 GLB 嘅輸出面向 -X，同純 Meshy 生成鏈唔同，要 +90° 修正）
│       └── 422 拒 → 改畫（手臂再開啲）重生成試一次
│                    → 再唔過先退 Tripo rig（rigLite + modelYaw: -Math.PI / 2）
├── 唔係、又唔想重畫 → Tripo 生成 → Tripo rig（tripo-rig-animate.mjs）
│         ├── rig 成功 → finalize → species.ts 加 rigLite + modelYaw
│         │   （代價：attack 唔會真揮武器，靠戰鬥特效補償）
│         └── rig 失敗（重試一次先）→ 保底：Tripo 靜態網格＋程序化動畫
└── 圓身／非人形（冇手腳嘅 blob）→ Tripo 生成 → Tripo rig
```

點解：

- **Meshy 生成用 `pose_mode: "a-pose"`，轉 pose 時會直接省略手持道具**——呢個係
  「2D 有武器、3D 冇武器」嘅根因。Tripo 用 `orientation: "align_image"` 完整保留
- **Meshy rig 嘅 pose estimation 要求「開揚企姿＋正面朝 +Z」兩樣齊**：
  - 舊封閉企姿（武器攬胸）實測 11 隻僅 1 隻過、15 隻僅 1 隻過（422 即拒）
  - 重畫開揚企姿之後如果 GLB 正面仍然朝 +X（Tripo 慣例）照樣 422；
    用 `scripts/rotate-glb.mjs <src> <dest> -90` 焗入旋轉後 4/4 全過
  - 即係話唔使急住重畫成批立繪——先試焗旋轉再入 Meshy，好多舊 422 可能係朝向問題
    （實測 12 隻舊「封閉企姿」模型焗旋轉後 9 隻直接過，唔使重畫）
- **長裙／冇腳角色（例如 lapis-queen）Meshy rig 過咗都唔好用**：pose estimation
  搵唔到腳，retarget 出嚟 hips 成個反轉、成套動畫背向鏡頭兼企唔穩；
  呢類角色直接保留 Tripo rig（rigLite）
- **圓身兼冇明顯手臂（例如 hainan-chicken-god 披風雞）Meshy 一律 422**，
  重畫開臂都冇用——非人形輪廓行 Tripo rig 決策枝
- Tripo rig 偶然單隻失敗係暫時性，重試一次通常會過
- **Tripo 生成嘅網格可能夾雜「垃圾幾何」**：貼地嘅扁平地台板／角色背後嘅
  直立薄板（通常近白色、冇 UV 對應角色貼圖）。rig 之後呢啲板俾骨拖住，
  攻擊動作成塊白板飛出嚟，好似角色變咗形。整治：
  `node scripts/strip-junk-geo.mjs --analyze <glb>` 搵出可疑組件
  （睇 flat／bright／sat 指標＋「白色候選」標記），再用 `--auto`（自動剷地台）
  或 `--box`（AABB 範圍剷）清走，唔使重新生成或者重 rig；
  記住唔好誤殺設計上嘅浮空食物碎（椰絲／麵包碎，通常細件而且分佈喺身周）
- **Tripo rig 有 `--spec=mixamo` 選項（標準人形骨架）——實測對 Q 版矮身角色會出
  變形姿勢**（idle 腳部下沉、skill 坐地），attack 揮武器係生動咗但唔抵換；
  Q 版精靈維持預設 tripo 骨架＋特效補償（弧光軌跡）係最穩陣
- **重跑 retarget 博唔到更好映射**：Tripo retarget 對同一骨架嘅 channel 映射係
  deterministic（實測新舊 attack 動畫 bone 集完全一致），唔好嘥 credits 重跑

`species.ts` 接線 pattern：

```ts
// Tripo rig（簡骨架，要程序化補動＋朝向修正）
modelUrl: "/models/{id}.glb", animated: true, rigLite: true, modelYaw: -Math.PI / 2,

// Meshy rig（全套骨架）
modelUrl: "/models/{id}.glb", animated: true,

// 保底：Tripo 靜態網格（武器完整，程序化動畫托底）
modelUrl: "/models/{id}.glb", modelYaw: -Math.PI / 2,  // 唔設 animated
```

- Tripo 網格正面朝 +X，所以預設 `modelYaw: -Math.PI / 2`；**個別網格例外**
  （align_image 跟原圖姿勢）。預設**唔算驗過**——必須 `diag-facing-calibrate` 確認
  玩家背＋敵位正面，再寫 `facing-lock`（見 `.cursor/rules/spirit-battle-facing.mdc`
  同 `spirit-3d-models` skill）。有 lock 後非必要唔准改 `modelYaw`
- 完整命令鏈：`gen-3d.mjs` → `tripo-rig-animate.mjs`（7 套動作）→
  `finalize-models.mjs`（合併＋Draco → `public/models/{id}.glb`，目標 <500KB）

## 3b. 系統二自動路由（bodyPlan 形態輪替 ＋ Meshy-first）

手工流程靠人判斷決策樹；系統二（`scripts/pipeline/`）要自動做同一件事，同時解決兩個
產品問題：**(A) 攻擊硬邦邦**、**(B) 全部人形愈嚟愈似（同質化）**。做法：

- **形態庫 `BODY_PLANS`（`lib/style-prompt.mjs`）**：8 個常規物種形態
  （humanoid-chef／beast-kin／dragon-kin／bird-kin／crustacean-kin／aquatic-kin／
  fae-spirit／golem-utensil）＋ 1 個例外 `blob`。關鍵設計：**8 個常規形態外觀多元
  （獸/龍/鳥/甲殼/水族/妖精/器物），但一律「直立雙足」底盤**——因為 Meshy pose-estimation
  只認人形輪廓，非直立（四足/蛇/blob）幾乎必 422。所以「多型態」同「rig 得到」唔矛盾，
  靠嘅係「多物種 × 統一直立姿勢」。
- **輪替（`concept.mjs` `chooseBodyPlan`）**：每隻自動換一個形態（以 roster 數量做基準＋id
  hash 打散＋避開最近一隻），寫入 `draft.family.bodyPlan` 同每階。`blob` 唔入輪替。
- **prompt（`buildConceptPrompt`／`buildArtPrompt`）**：concept 叫 LLM 將成條三階線設計成
  嗰個物種形態；art 用 `RIG_STANCE`（強化版 rig 通行證企姿）＋ `NEGATIVE_STANCE`
  （負面詞：禁四足/蛇身/浮空/攬胸/道具橫胸/翼包身），令生成圖天生 rig-friendly。
- **rig 路由（`rig.mjs`）**：睇 `bodyPlan.rig`——
  - `"meshy"` → **Meshy rig 優先**（`rotate-glb -90` → `rig-animate --src=tripo --glb=<rot>`）
    ＝ fullRig，真手腳動、攻擊唔硬 → `finalize` 落 `animated:true`（無 rigLite）＋`modelYaw:+π/2`
  - Meshy 失敗 → 退 **Tripo rig**（rigLite，`-π/2`）
  - `"static"`（blob）→ 唔 rig，`finalize` 做靜態網格
  - 記 `draft.artifacts.rigModeByStage[id]`，`finalize.mjs` 據此落正確旗標（唔好手 set）
- **程序化出擊托底**：就算落到 rigLite／static，`SpiritModel` 都有「蓄力→前撲」程序化攻擊
  （見 `spirit-3d-models` skill），所以「攻擊硬」唔一定要靠 Meshy——rig 只係錦上添花。
- **成本紀律**：Meshy rig 每隻先 rotate 再入，422 唔收費；`--live` 先會燒 credits，dry-run 全 mock。

## 4. 任務紀錄檔管理（model-pipeline/gen/tasks*.json）

- done 條目會令 script **跳過**該任務——重做前要：
  1. 刪 `tasks*.json` 入面對應 id 嘅條目（`anim:*`／`rig:*`／`tripo:*`）
  2. 刪 `model-pipeline/gen/anim/{id}/` 資料夾
- **兩個 script 寫同一個 tasks 檔唔可以平行行**（啟動同每次 save 都全檔覆寫，會互相蓋走）；
  寫唔同 tasks 檔先可以平行
- rig 之前先用 Read 睇 `model-pipeline/gen/tripo/{id}-preview.webp` 驗網格完整
  （試過出無頭網格——刪 task 條目重生成即可，唔好將爛網格送去 rig 嘥 credits）

## 5. 驗證工作流

- `node scripts/diag-model.mjs {id} idle,attack` 截圖 → **必須用 Read 肉眼睇**，
  檢查四樣：武器在手、企穩地面、朝向啱（見下）、**面形冇扭曲**（眼冇糊冇歪、五官對稱、
  無溶面）——面歪係 2D 原圖問題，修返正面臉重生成 2D，唔好重跑 rig
- **切磋朝向（大修後硬閘）**：換 GLB／rig／finalize 後必須
  `node scripts/diag-yaw-sweep.mjs <id>`（`__dbgYaw` 已接線）＋ Read 目視——
  玩家**背向鏡頭**＝啱，見臉＝錯。詳見 `spirit-3d-models` skill「大修後必做」。
  **唔好**信舊結論（例如 chwee-sentry 曾誤寫 `+π/2`）。
- 朝向唔確定嘅 debug 套路（`/dev/model` 頁面）：
  1. `?species={id}&anim=none&yaw={度數}` 先做 yaw sweep 定 rest pose 朝向
     （page 嘅 yaw 參數係疊加喺 species `modelYaw` 之上；battle 校準優先用
     `diag-yaw-sweep` 喺真 `/battle`）
  2. 定咗 rest 朝向再開 clips 驗（rig 動畫可能同 rest pose 有偏差）
  3. `?battle=1` 複現實戰企位做最終確認
- 深色模型喺深色背景好難判斷朝向：用 sharp crop 放大頭部區域先落結論，
  唔好靠細圖估（估錯會兜好多圈）
- 收尾必行：`npx tsc --noEmit` ＋ `node scripts/diag-wave1-pilot.mjs` 全綠

## 5b. 圖鑑效能／合伙人畫廊（產品交付）

- **圖鑑列表**可保留 640 `full/` 立繪，但要用 `DexGridCell` 式離屏延遲掛載
  （IntersectionObserver＋`content-visibility`）——一開就掛幾十張 WebGL／大圖會卡／黑 mon
- **圖鑑詳情**：2D full 先出；3D／「360° 立體睇」可選再開（唔好一入詳情就 mount Canvas）
- 合伙人靜態畫廊：`public/partner-gallery/index.html`——URL **必須**帶
  `/partner-gallery/index.html`（淨開 `/partner-gallery` 會畀 Next 404）
- 重建畫廊：`node scripts/build-partner-gallery.mjs`

## 6. Credits 紀律

- 任何生成／rig 開始前**必須報預算俾用戶批准**；完工報實際消耗
- 實測參考成本：Tripo 生成約 20–25／隻、Tripo rig＋7 套動畫約 100／隻；
  Meshy rig 5／隻＋動畫約 3／套（全套約 23）；Meshy 422 拒絕**唔收費**，試錯零成本
- 兩邊 API key 都喺 `.env.local`；balance endpoint：
  Meshy `GET /openapi/v1/balance`、Tripo `GET /v2/openapi/user/balance`
