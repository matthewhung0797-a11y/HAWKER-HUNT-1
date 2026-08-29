# Adapter：Hawker Hunt

本 repo 專屬接線。通用鐵律見上層 `SKILL.md`。

## Schema / 內容真相

| 用途 | 路徑 |
|---|---|
| 精靈 | `src/content/species.ts` |
| 道具 | `src/content/items.ts` |
| 技能特效 | `src/content/skill-fx.ts` |
| 據點／spawn | `src/content/centres.ts` |
| Draft | `content/pending-pets/<id>.json` + Supabase `pets` |
| GLB | `public/models/<id>.glb` |
| 立繪 full | `public/spirits/full/<id>.webp` |
| Icon | `public/spirits/<id>.webp` |

Flags：`modelUrl`、`animated`、`rigLite`、`modelYaw`、`modelHeightM`。  
Facing lock 註解：`// facing-lock: YYYY-MM-DD player-back enemy-face`。

## 主題 / 畫風

- 新加坡小販美食精靈；五行 × 五味
- Style DNA／refs：`scripts/pipeline/lib/style-prompt.mjs`
- 食物融合：`FOOD_EMBODIMENT`（裝備由食材轉化，禁捧碟）

## 技能上限

- `MAX_SKILLS_PER_STAGE = 2`（`scripts/pipeline/lib/skill-limits.mjs`）
- 治療佔一格；publish：`scripts/pipeline/lib/playability.mjs`

## 管線指令

```bash
# 編排
node scripts/pipeline/run.mjs --id <draftId> …

# Facing
$env:DIAG_BASE="http://localhost:3000"
node scripts/diag-facing-calibrate.mjs <id>
# → test-shots/facing-cal/decisions.json
node scripts/apply-facing-lock.mjs
node scripts/diag-facing-audit.mjs <id>

# 閘
npm run facing:static
# publish 用 draft 範圍：node scripts/check-facing-static.mjs --draft=$PET_ID
```

Stages：`scripts/pipeline/stages/{concept,art,model3d,rig,finalize,skills}.mjs`  
Publish：`scripts/pipeline/publish.mjs`（approve 前 hydrate facing from pets DB）。

## 3D 慣例（Hawker 實測）

| 鏈 | 典型 modelYaw 起點 | flags |
|---|---|---|
| Tripo + Tripo rig | `-π/2` | `animated` + `rigLite` |
| Tripo + Meshy rig | `+π/2` | `animated`（無 rigLite） |
| Static blob | `-π/2` 或校準後 | 無 animated |

起點 ≠ lock——必須 calibrate。

## 審批 / Host

- Admin facing lab + checklist → Supabase
- Telegram webhook → `repository_dispatch` → `pet-publish.yml`
- 正式 domain：`https://hawker-hunt-rust.vercel.app`

## 相關專案 skill（細節）

- `.cursor/skills/spirit-asset-pipeline/SKILL.md` — 實作級 prompt／credits
- `.cursor/skills/spirit-3d-models/SKILL.md` — SpiritModel／facing 指令
- `.cursor/rules/spirit-battle-facing.mdc` — 面向禁改規則
- `.cursor/skills/gameplay-loop-tuning/SKILL.md` — 能量／手感

## 鐵律覆寫

- **唔好**為修一隻而改其他寵 `modelYaw` 或 battle `lookAt`
- 新中文名 → `node scripts/build-font.mjs`（粉圓體子集）
