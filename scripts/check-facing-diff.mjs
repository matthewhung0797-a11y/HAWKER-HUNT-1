/**
 * Facing Gate B — 差異觸發
 *
 * 若 git diff 掂到面向敏感檔：
 *   1) 一定跑 Gate A（靜態）
 *   2) 推斷受影響 id → 跑 Gate C golden（要 :3000；CI 會起 dev server）
 * 若 battle 核心改動 → 驗整個 GOLDEN_SAMPLE（或 --all）
 *
 * Run:
 *   node scripts/check-facing-diff.mjs
 *   node scripts/check-facing-diff.mjs --base origin/master
 *   node scripts/check-facing-diff.mjs --static-only   # 淨 A（冇 browser）
 *
 * Skip: FACING_SKIP=1
 */
import { spawnSync } from "node:child_process";
import { listGlbSpecies } from "./lib/facing-species.mjs";
import {
  facingSkip,
  listChangedFiles,
  isFacingSensitive,
  affectedSpeciesIds,
  GOLDEN_SAMPLE,
} from "./lib/facing-gate.mjs";

if (facingSkip()) {
  console.log("[facing-diff] FACING_SKIP=1 — skipped");
  process.exit(0);
}

const args = process.argv.slice(2);
const staticOnly = args.includes("--static-only");
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;

const changed = listChangedFiles(base);
const sensitive = changed.filter(isFacingSensitive);

console.log(`[facing-diff] changed files: ${changed.length}`);
if (sensitive.length === 0) {
  console.log("[facing-diff] 冇面向敏感改動 — 仍跑 Gate A 保底");
} else {
  console.log("[facing-diff] sensitive:");
  for (const f of sensitive) console.log("  •", f);
}

function run(cmd, cmdArgs) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("node", ["scripts/check-facing-static.mjs"]);

if (staticOnly || sensitive.length === 0) {
  console.log("\n[facing-diff] OK (static only / no visual trigger)");
  process.exit(0);
}

const allIds = listGlbSpecies().map((s) => s.id);
const { ids, battleCore } = affectedSpeciesIds(sensitive, allIds);
let visualIds = ids.length ? ids : GOLDEN_SAMPLE;
if (battleCore) {
  visualIds = GOLDEN_SAMPLE.filter((id) => allIds.includes(id));
  console.log("[facing-diff] battle 核心改動 → golden sample 全驗");
}
visualIds = [...new Set(visualIds)].filter((id) => allIds.includes(id));

if (visualIds.length === 0) {
  console.log("[facing-diff] 冇可對嘅 id — 跳過 golden");
  process.exit(0);
}

console.log(`[facing-diff] golden ids (${visualIds.length}):`, visualIds.join(", "));
run("node", ["scripts/check-facing-golden.mjs", ...visualIds]);
console.log("\n[facing-diff] OK");
