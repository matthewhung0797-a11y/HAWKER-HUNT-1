/**
 * Facing Gate A — 靜態硬閘（唔使 browser／dev server）
 *
 * 檢查：
 * 1. 每隻有 modelUrl 必須有 facing-lock 註解
 * 2. GLB 有 tripo::Root + animated → 必須 rigLite
 * 3. 禁止 enemyYawFlip 等識別字
 * 4. battle 站位／鏡頭／lookAt 幾何對得上 facing-battle-lock.json
 * 5. SpiritModel stripRoot 必須跟 rigLite
 *
 * Run: node scripts/check-facing-static.mjs
 * Skip: FACING_SKIP=1
 * 允許改 battle 幾何：FACING_ALLOW_BATTLE_UNLOCK=1（仍要重產 golden）
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { listGlbSpecies } from "./lib/facing-species.mjs";
import {
  facingSkip,
  loadBattleLock,
  glbHasTripoRoot,
  glbHasHips,
} from "./lib/facing-gate.mjs";

if (facingSkip()) {
  console.log("[facing-static] FACING_SKIP=1 — skipped");
  process.exit(0);
}

const root = process.cwd();
const errors = [];
const warnings = [];

/** --draft=<id>：只查呢個 pending draft 嘅三階（pet-publish 用；全量歷史債交 facing-gate） */
const draftArg = process.argv.find((a) => a.startsWith("--draft="))?.split("=")[1];
let species = listGlbSpecies(root);
if (draftArg) {
  const draftPath = resolve(root, "content/pending-pets", `${draftArg}.json`);
  if (!existsSync(draftPath)) {
    console.error(`[facing-static] 搵唔到 draft ${draftArg}`);
    process.exit(1);
  }
  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  const ids = new Set(
    (draft.speciesList ?? []).map((s) => s.id).filter(Boolean)
  );
  if (!ids.size) {
    console.error(`[facing-static] draft ${draftArg} 冇 speciesList`);
    process.exit(1);
  }
  species = species.filter((s) => ids.has(s.id));
  // publish 啱啱 append 嘅可能仲未入 listGlbSpecies 若失敗——用 draft 補查
  const have = new Set(species.map((s) => s.id));
  for (const id of ids) {
    if (have.has(id)) continue;
    // 直接讀 species.ts 窗口
    const src = readFileSync(resolve(root, "src/content/species.ts"), "utf8");
    const needle = `id: "${id}"`;
    const idx = src.indexOf(needle);
    if (idx < 0) {
      errors.push(`${id}: publish 後 species.ts 仍然冇呢隻`);
      continue;
    }
    const win = src.slice(idx, idx + 1200);
    species.push({
      id,
      modelUrl: `/models/${id}.glb`,
      locked: /facing-lock:/.test(win) && !/pipeline default/i.test(win),
      animated: /animated:\s*true/.test(win),
      rigLite: /rigLite:\s*true/.test(win),
    });
  }
  console.log(
    `[facing-static] draft 範圍：${[...ids].join(", ")}（${species.length} 隻）`
  );
}
const battle = readFileSync(resolve(root, "src/app/battle/page.tsx"), "utf8");
const spiritModel = readFileSync(
  resolve(root, "src/components/three/SpiritModel.tsx"),
  "utf8"
);
const lock = loadBattleLock(root);

// ── 1) facing-lock ──
for (const s of species) {
  if (!s.locked) {
    errors.push(`${s.id}: 有 modelUrl 但缺 // facing-lock: … 註解`);
  }
  if (!existsSync(resolve(root, "public/models", `${s.id}.glb`))) {
    errors.push(`${s.id}: species 寫咗 modelUrl 但 public/models/${s.id}.glb 唔存在`);
  }
}

// ── 2) Tripo Root ↔ rigLite ──
for (const s of species) {
  const glb = resolve(root, "public/models", `${s.id}.glb`);
  if (!existsSync(glb)) continue;
  const tripo = glbHasTripoRoot(glb);
  const hips = glbHasHips(glb);
  if (tripo && s.animated && !s.rigLite) {
    errors.push(
      `${s.id}: GLB 有 tripo::Root 且 animated:true，必須 rigLite:true（否則 idle 搶 lookAt 側身）`
    );
  }
  if (hips && s.rigLite) {
    warnings.push(
      `${s.id}: Meshy Hips + rigLite:true — 通常唔應該（會變成程序化疊加而非 fullRig）`
    );
  }
}

// ── 3) 禁止識別字 ──
const scanFiles = [
  "src/app/battle/page.tsx",
  "src/components/three/SpiritModel.tsx",
  "src/content/species.ts",
];
for (const rel of scanFiles) {
  const src = readFileSync(resolve(root, rel), "utf8");
  for (const bad of lock.forbiddenIdentifiers || []) {
    if (src.includes(bad)) {
      errors.push(`${rel}: 禁止出現 \`${bad}\`（敵位專用 flip 已廢除）`);
    }
  }
}

// ── 4) battle 幾何鎖定 ──
function fmtArr(a) {
  return `[${a.map((n) => String(n)).join(", ")}]`;
}
const allowBattle =
  process.env.FACING_ALLOW_BATTLE_UNLOCK === "1" ||
  process.env.FACING_ALLOW_BATTLE_UNLOCK === "true";

if (!allowBattle) {
  const checks = [
    [`PLAYER_POS`, `const PLAYER_POS: [number, number, number] = ${fmtArr(lock.PLAYER_POS)};`],
    [`ENEMY_POS`, `const ENEMY_POS: [number, number, number] = ${fmtArr(lock.ENEMY_POS)};`],
    [
      `cameraLookAt`,
      `state.camera.lookAt(${lock.cameraLookAt.join(", ")});`,
    ],
    [
      `cameraPositionBase`,
      `-0.46 + Math.sin`, // 位置用 sin 浮動，鎖前綴
    ],
  ];
  for (const [name, needle] of checks) {
    if (!battle.includes(needle)) {
      errors.push(
        `battle/page.tsx: ${name} 偏離 facing-battle-lock.json（要改幾何請設 FACING_ALLOW_BATTLE_UNLOCK=1 並重產 golden）\n  期望含: ${needle}`
      );
    }
  }
  // BattleActor 必須 lookAt 對手（對稱）
  if (!/g\.lookAt\(\s*target\.x\s*,\s*basePos\[1\]\s*,\s*target\.z\s*\)/.test(battle)) {
    errors.push(
      "battle/page.tsx: BattleActor 必須用 g.lookAt(target.x, basePos[1], target.z)（唔好改成敵位 flip）"
    );
  }
} else {
  warnings.push(
    "FACING_ALLOW_BATTLE_UNLOCK=1 — 已跳過 battle 幾何檢查；記得更新 facing-battle-lock.json + golden"
  );
}

// ── 5) stripRoot ← rigLite ──
if (lock.stripRootMustUseRigLite) {
  if (!/stripRoot=\{Boolean\(species\.rigLite\)\}/.test(spiritModel)) {
    errors.push(
      "SpiritModel.tsx: stripRoot 必須係 Boolean(species.rigLite)（Tripo root motion 閘）"
    );
  }
}

// ── report ──
for (const w of warnings) console.warn("⚠️ ", w);
if (errors.length) {
  console.error(`\n[facing-static] FAIL — ${errors.length} error(s):\n`);
  for (const e of errors) console.error(" ✗", e);
  console.error(
    `\n修法：補 facing-lock／rigLite；或跑 diag-facing-calibrate + apply-facing-lock。\n緊急跳過：FACING_SKIP=1\n`
  );
  process.exit(1);
}

console.log(
  `[facing-static] OK — ${species.length} GLB species${draftArg ? ` (draft ${draftArg})` : ""}, battle lock, stripRoot wiring`
);
if (warnings.length) {
  console.log(`(${warnings.length} warning(s))`);
}
