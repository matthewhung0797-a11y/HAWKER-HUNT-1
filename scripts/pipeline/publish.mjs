// Publish stage —— 只有「已批准」嘅 draft 先可以出街，一次過理成條三階線。
// 預設 DRY-RUN：組裝 species.ts 條目 snippet 寫去 preview 檔 + 列出要搬嘅產物 + spawnPool 計劃，
//   完全唔郁 species.ts / centres.ts / public/。
// 真正寫入要 --commit 且 env PET_PIPELINE_COMMIT=1 雙重解鎖（CI 開 PR 用，絕不 auto-deploy）：
//   1. append 三階 species 落 species.ts
//   2. 搬 webp / glb 入 public/（逐階）
//   3. stage1 自動加入啱 element 嘅據點 spawnPool（centres.ts）
//   令一隻新寵人手 merge / deploy 後即刻 plug-and-play。冇批准紀錄一律拒絕。
//
// 用法：
//   node scripts/pipeline/publish.mjs <id>            # dry-run 預覽
//   PET_PIPELINE_COMMIT=1 node scripts/pipeline/publish.mjs <id> --commit   # 真寫（CI PR）

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readDraft, writeDraft } from "./lib/draft.mjs";
import {
  setPetStatus,
  petsDbConfigured,
  hydrateDraftFacingFromPets,
} from "./lib/pets-db.mjs";
import { checkPlayability } from "./lib/playability.mjs";

const id = process.argv[2];
const commit = process.argv.includes("--commit") && process.env.PET_PIPELINE_COMMIT === "1";
if (!id) {
  console.error("usage: node scripts/pipeline/publish.mjs <id> [--commit]");
  process.exit(1);
}

let draft = readDraft(id);
if (!draft) {
  console.error(`搵唔到 draft: ${id}`);
  process.exit(1);
}

// 後台揀 yaw 只寫 pets DB——publish 前同步入 draft，唔好用分支舊嘅 pipeline default
if (petsDbConfigured) {
  const h = await hydrateDraftFacingFromPets(draft);
  draft = h.draft;
  if (h.hydrated) {
    writeDraft(draft);
    console.log(`▶ 已由 pets DB hydrate facing-lock／modelYaw（${h.reason}）`);
  } else {
    console.log(`▶ pets hydrate：${h.reason}`);
  }
}

// ── 安全閘：一定要有批准紀錄 ──
if (draft.status !== "approved" || draft.decision?.verdict !== "approve") {
  console.error(`🚫 [${id}] 未批准（status=${draft.status}）——publish 拒絕。先 approve 先。`);
  process.exit(1);
}
const speciesList = draft.speciesList ?? (draft.species ? [draft.species] : []);
if (!speciesList.length) {
  console.error(`🚫 [${id}] draft 冇組裝好嘅 species 定義，無法出街。`);
  process.exit(1);
}

// 五行 → 主據點（hk-test 係 dev 據點，唔計）
const ELEMENT_CENTRE = {
  earth: "maxwell",
  water: "chinatown-complex",
  fire: "old-airport-road",
  metal: "tekka-centre",
  wood: "lau-pa-sat",
};

function yawExpr(v) {
  const P = Math.PI;
  if (v === 0) return "0";
  if (Math.abs(v - P / 2) < 1e-6) return "Math.PI / 2";
  if (Math.abs(v + P / 2) < 1e-6) return "-Math.PI / 2";
  if (Math.abs(v - P) < 1e-6) return "Math.PI";
  return String(v);
}

const j = (o) => JSON.stringify(o);

/** 砌一段對齊 species.ts 風格嘅 Species 物件字面量 */
function serializeSpecies(sp) {
  const lines = [];
  lines.push("  {");
  lines.push(`    id: ${j(sp.id)},`);
  lines.push(`    seriesId: ${j(sp.seriesId)},`);
  lines.push(`    stage: ${sp.stage},`);
  lines.push(`    name: { en: ${j(sp.name.en)}, zh: ${j(sp.name.zh)} },`);
  lines.push(`    element: ${j(sp.element)},`);
  lines.push(`    flavor: ${j(sp.flavor)},`);
  lines.push(`    rarity: ${j(sp.rarity)},`);
  lines.push(`    foodOrigin: { en: ${j(sp.foodOrigin.en)}, zh: ${j(sp.foodOrigin.zh)} },`);
  lines.push(`    description: {`);
  lines.push(`      en: ${j(sp.description.en)},`);
  lines.push(`      zh: ${j(sp.description.zh)},`);
  lines.push(`    },`);
  lines.push(`    baseStats: { hp: ${sp.baseStats.hp}, attack: ${sp.baseStats.attack}, defense: ${sp.baseStats.defense}, speed: ${sp.baseStats.speed} },`);
  lines.push(`    skills: [`);
  for (const sk of sp.skills) {
    lines.push(`      {`);
    lines.push(`        id: ${j(sk.id)},`);
    lines.push(`        name: { en: ${j(sk.name.en)}, zh: ${j(sk.name.zh)} },`);
    lines.push(`        description: { en: ${j(sk.description.en)}, zh: ${j(sk.description.zh)} },`);
    lines.push(`        power: ${sk.power},`);
    lines.push(`        cooldown: ${sk.cooldown},`);
    if (sk.healPercent != null) lines.push(`        healPercent: ${sk.healPercent},`);
    lines.push(`      },`);
  }
  lines.push(`    ],`);
  lines.push(`    evolvesTo: ${sp.evolvesTo == null ? "null" : j(sp.evolvesTo)},`);
  lines.push(`    evolutionRequirement: ${sp.evolutionRequirement == null ? "null" : j(sp.evolutionRequirement)},`);
  lines.push(`    modelUrl: ${sp.modelUrl == null ? "null" : j(sp.modelUrl)},`);
  lines.push(`    modelHeightM: ${sp.modelHeightM},`);
  if (sp.animated) lines.push(`    animated: true,`);
  if (sp.rigLite) lines.push(`    rigLite: true,`);
  if (sp.modelUrl && sp.modelYaw != null) {
    const lock = draft.facingLockByStage?.[sp.id] ?? draft.manifest?.facingLockByStage?.[sp.id];
    const day = (lock?.at ?? new Date().toISOString()).slice(0, 10);
    if (lock?.verified) {
      lines.push(`    // facing-lock: ${day} player-back enemy-face`);
    } else {
      // 占位唔寫「verify」字樣會誤過閘——明確標 pipeline default
      lines.push(`    // facing-lock: ${day} pipeline default — verify`);
    }
    const yaw = lock?.verified && lock.modelYaw != null ? lock.modelYaw : sp.modelYaw;
    lines.push(`    modelYaw: ${yawExpr(yaw)},`);
  } else if (sp.modelYaw != null) {
    lines.push(`    modelYaw: ${yawExpr(sp.modelYaw)},`);
  }
  lines.push("  },");
  return lines.join("\n");
}

const snippet = speciesList.map(serializeSpecies).join("\n");
const fxEntries = Object.entries(draft.fxBySkill ?? {});
const fxSnippet = fxEntries
  .map(([skillId, config]) => `  ${j(skillId)}: ${j(config)},`)
  .join("\n");
const basicFxSnippet = draft.basicFx && draft.family?.seriesId
  ? `  ${j(draft.family.seriesId)}: ${j(draft.basicFx)},`
  : "";

function appendRecordEntries(file, exportName, nextExportName, entries) {
  if (!entries.length) return 0;
  let source = readFileSync(file, "utf8");
  const start = source.indexOf(`export const ${exportName}:`);
  const end = source.indexOf(`export const ${nextExportName}:`, start);
  if (start < 0 || end < 0) throw new Error(`搵唔到 ${exportName} / ${nextExportName} 邊界`);
  const close = source.lastIndexOf("\n};", end);
  if (close < start) throw new Error(`搵唔到 ${exportName} 結尾`);

  const fresh = entries.filter(([key]) => !source.slice(start, end).includes(`${j(key)}:`));
  if (!fresh.length) return 0;
  const lines = fresh.map(([key, value]) => `  ${j(key)}: ${j(value)},`).join("\n");
  source = source.slice(0, close) + "\n" + lines + source.slice(close);
  writeFileSync(file, source, "utf8");
  return fresh.length;
}

// ── 寫預覽 TS（順手畀 tsc 校驗合乎 Species schema）──
const previewPath = `content/pending-pets/${id}.published-preview.ts`;
writeFileSync(
  previewPath,
  `// AUTO-GENERATED 預覽 —— 由 publish.mjs 組裝，未寫入 species.ts。\n` +
    `// 批准人：${draft.decision.by ?? "?"}（${draft.decision.at}）\n` +
    (draft.decision.reason ? `// 原因/備註：${draft.decision.reason}\n` : "") +
    `// 出街時將下面 previewSpecies 陣列嘅物件字面量貼入 SPECIES 陣列（對應系列後面）。\n\n` +
    `import type { Species } from "@/content/types";\n\n` +
    `export const previewSpecies: Species[] = [\n` +
    snippet +
    `\n];\n`,
  "utf8"
);

console.log(`\n=== publish [${id}] ${commit ? "COMMIT" : "DRY-RUN"} ===`);
console.log(`三階 species 條目預覽 → ${previewPath}`);
console.log(`\n${snippet}\n`);
if (fxSnippet) console.log(`技能 FX 預覽（SKILL_FX）：\n${fxSnippet}\n`);
if (basicFxSnippet) console.log(`系列普攻 FX 預覽（BASIC_FX）：\n${basicFxSnippet}\n`);

// ── 要搬入 public/ 嘅產物（逐階 webp / glb）──
const stage1 = speciesList[0];
const artByStage = draft.artifacts.artByStage ?? (draft.artifacts.art ? { [stage1.id]: draft.artifacts.art } : {});
const finalByStage = draft.artifacts.finalByStage ?? (draft.artifacts.final ? { [stage1.id]: draft.artifacts.final } : {});
const moves = [];
for (const sp of speciesList) {
  if (artByStage[sp.id]) moves.push([artByStage[sp.id], `public/spirits/full/${sp.id}.webp`]);
  if (finalByStage[sp.id]) moves.push([finalByStage[sp.id], `public/models/${sp.id}.glb`]);
}
console.log("要搬嘅產物：");
if (moves.length === 0) console.log("  （mock —— 未有真產物；真流程會有逐階 webp / glb）");
for (const [src, dst] of moves) console.log(`  ${src}  →  ${dst}${existsSync(src) ? "" : "  (源檔未存在，mock)"}`);

// ── spawnPool 計劃：stage1 入啱 element 嘅據點 ──
const targetCentre = ELEMENT_CENTRE[stage1.element];
console.log(`\nspawnPool 計劃：`);
if (targetCentre) console.log(`  ${stage1.id}（${stage1.element}）→ 據點 ${targetCentre} spawnPool`);
else console.log(`  ⚠️ element=${stage1.element} 冇對應據點，需人手指定`);

// ── 進化材料（--commit 會自動 append 落 items.ts）──
if (draft.evolutionItem) {
  const it = draft.evolutionItem;
  console.log(`\n進化材料：${it.name.zh}（${it.id}）— ${commit ? "會 append 落 items.ts" : "dry-run 只列，commit 先寫"}`);
}
console.log(
  `模型旗標提醒：有真 GLB 必須 npm run facing:static；正式校準用 diag-facing-calibrate + apply-facing-lock + facing:golden:write（見 spirit-battle-facing rule）。`
);

// 可玩硬閘（dry-run 都預先報；commit 失敗就停）
const play = checkPlayability(draft, { requireFacing: true });
if (!play.ok) {
  console.error(`🚫 [${id}] 未達可玩標準，拒絕 publish：\n  - ${play.errors.join("\n  - ")}`);
  if (commit) process.exit(1);
}

if (!commit) {
  console.log(`\n這是 dry-run：冇改 species.ts / centres.ts / public/。`);
  console.log(`CI 真出街：喺 workflow 用 PET_PIPELINE_COMMIT=1 ... --commit → append + 搬產物 + 接 spawnPool，再開 PR（絕不 push main）。`);
  process.exit(0);
}

// ══════════ COMMIT 路徑（雙重解鎖；本意 CI 開 PR，絕不直接改 production）══════════

// 1) append 三階 species 落 species.ts
const SPECIES_FILE = "src/content/species.ts";
let src = readFileSync(SPECIES_FILE, "utf8");
for (const sp of speciesList) {
  if (src.includes(`id: ${j(sp.id)},`)) {
    console.error(`species.ts 已經有 ${sp.id}，唔重覆 append。`);
    process.exit(1);
  }
}

// 1b) SERIES 條目（系列名／分組）
const fam = draft.family;
if (fam?.seriesId && !src.includes(`id: ${j(fam.seriesId)},`)) {
  const seriesSnippet =
    `  {\n` +
    `    id: ${j(fam.seriesId)},\n` +
    `    name: { en: ${j(fam.name?.en ?? fam.foodOrigin?.en ?? fam.seriesId)}, zh: ${j(fam.name?.zh ?? fam.foodOrigin?.zh ?? fam.seriesId)} },\n` +
    `    element: ${j(fam.element)},\n` +
    `    flavor: ${j(fam.flavor)},\n` +
    `    foodOrigin: { en: ${j(fam.foodOrigin.en)}, zh: ${j(fam.foodOrigin.zh)} },\n` +
    `  },`;
  const seriesMarker = "export const SERIES:";
  const sStart = src.indexOf(seriesMarker);
  const sEnd = src.indexOf("\n];", sStart);
  if (sStart >= 0 && sEnd > sStart) {
    src = src.slice(0, sEnd) + "\n" + seriesSnippet + src.slice(sEnd);
    console.log(`✅ 已 append SERIES ${fam.seriesId}`);
  } else {
    console.warn(`⚠️ 搵唔到 SERIES 陣列結尾，需人手加 ${fam.seriesId}`);
  }
}
const marker = "\n];";
const idx = src.lastIndexOf(marker);
if (idx < 0) {
  console.error("搵唔到 SPECIES 陣列結尾，唔敢亂改。");
  process.exit(1);
}
src = src.slice(0, idx) + "\n" + snippet + src.slice(idx);
writeFileSync(SPECIES_FILE, src, "utf8");
console.log(`✅ 已 append ${speciesList.length} 階落 ${SPECIES_FILE}`);

// 2) append 技能／系列普攻 FX（有先加，重跑唔會重覆）
const SKILL_FX_FILE = "src/content/skill-fx.ts";
if (fxEntries.length) {
  const added = appendRecordEntries(SKILL_FX_FILE, "SKILL_FX", "DEFAULT_SKILL_FX", fxEntries);
  console.log(`✅ 已 append ${added}/${fxEntries.length} 個技能 FX 落 ${SKILL_FX_FILE}`);
}
if (draft.basicFx && draft.family?.seriesId) {
  const added = appendRecordEntries(
    SKILL_FX_FILE,
    "BASIC_FX",
    "ARCHETYPE_IMPACT_MS",
    [[draft.family.seriesId, draft.basicFx]]
  );
  console.log(`✅ 已 append ${added}/1 個系列普攻 FX 落 ${SKILL_FX_FILE}`);
}

// 3) 搬產物入 public/（源檔存在先搬）
let moved = 0;
for (const [srcPath, dst] of moves) {
  if (!existsSync(srcPath)) {
    console.log(`  跳過（源檔未存在）：${srcPath}`);
    continue;
  }
  if (resolve(srcPath) === resolve(dst)) {
    console.log(`  已喺位（真圖流程直接寫 public）：${dst}`);
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(srcPath, dst);
  moved++;
  console.log(`  搬：${srcPath} → ${dst}`);
}
console.log(`✅ 搬咗 ${moved}/${moves.length} 個產物`);

// 4) stage1 入 spawnPool（centres.ts）
if (targetCentre) {
  const CENTRES_FILE = "src/content/centres.ts";
  const csrc = readFileSync(CENTRES_FILE, "utf8");
  if (csrc.includes(`"${stage1.id}"`)) {
    console.log(`  spawnPool 已有 ${stage1.id}，跳過。`);
  } else {
    const lines = csrc.split("\n");
    // 搵目標據點 block，然後喺佢嘅 spawnPool 行尾插入
    const centreIdLine = lines.findIndex((l) => l.includes(`id: "${targetCentre}"`));
    let done = false;
    if (centreIdLine >= 0) {
      for (let i = centreIdLine; i < Math.min(lines.length, centreIdLine + 20); i++) {
        if (lines[i].includes("spawnPool:")) {
          // 喺最後一個 `]` 前插入 id（保留原有內容）
          lines[i] = lines[i].replace(/\]\s*,?\s*$/, (m) => `, "${stage1.id}"${m}`);
          done = true;
          break;
        }
      }
    }
    if (done) {
      writeFileSync(CENTRES_FILE, lines.join("\n"), "utf8");
      console.log(`✅ ${stage1.id} 已加入據點 ${targetCentre} 嘅 spawnPool`);
    } else {
      console.log(`  ⚠️ 搵唔到 ${targetCentre} 嘅 spawnPool，需人手加 ${stage1.id}`);
    }
  }
}

// 5) 進化材料 append 落 items.ts（冇先加，令進化 UI 攞到材料）
if (draft.evolutionItem) {
  const ITEMS_FILE = "src/content/items.ts";
  const it = draft.evolutionItem;
  const isrc = readFileSync(ITEMS_FILE, "utf8");
  if (isrc.includes(`id: "${it.id}"`)) {
    console.log(`  items.ts 已有 ${it.id}，跳過。`);
  } else {
    const itemSnippet =
      `  {\n` +
      `    id: ${j(it.id)},\n` +
      `    name: { en: ${j(it.name.en)}, zh: ${j(it.name.zh)} },\n` +
      `    description: { en: ${j(it.description.en)}, zh: ${j(it.description.zh)} },\n` +
      `    icon: ${j(it.icon)},\n` +
      `  },`;
    const imk = isrc.lastIndexOf("\n];");
    if (imk >= 0) {
      writeFileSync(ITEMS_FILE, isrc.slice(0, imk) + "\n" + itemSnippet + isrc.slice(imk), "utf8");
      console.log(`✅ 進化材料 ${it.id} 已 append 落 ${ITEMS_FILE}`);
    } else {
      console.log(`  ⚠️ 搵唔到 ITEMS 陣列結尾，需人手加 ${it.id}`);
    }
  }
}

console.log(`\n完成 append + FX + 產物 + spawnPool + 進化材料。記得跑 tsc + lint，再開 PR（唔好直接 push main）。`);
console.log(`⚠️ 新中文名入咗 species.ts：本機跑 node scripts/build-font.mjs 重建粉圓體子集，`);
console.log(`   再 commit public/fonts/openhuninn-subset.woff2——唔 rebuild 會缺字 fallback（「卜」變粗嗰類）。`);

// pets 表標記出街。GHA 設 PET_PIPELINE_DEFER_PUBLISHED=1：等 merge master 成功先標，
// 避免「DB published 但圖鑑冇」（merge／PR 失敗時假陽性）。
if (petsDbConfigured) {
  if (process.env.PET_PIPELINE_DEFER_PUBLISHED === "1") {
    console.log("pets DB：暫緩標記 published（等 merge master 成功）");
  } else {
    const ok = await setPetStatus(id, "published");
    console.log(`pets DB：${ok ? "已標記 published ✅" : "更新失敗"}`);
  }
}
