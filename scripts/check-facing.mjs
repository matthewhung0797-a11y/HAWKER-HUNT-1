/**
 * Facing 硬閘入口（A + 可選 B/C）
 *
 *   node scripts/check-facing.mjs              # A only（本地／pre-commit 快）
 *   node scripts/check-facing.mjs --diff       # A + 差異觸發 C
 *   node scripts/check-facing.mjs --golden     # A + 抽樣 golden
 *   node scripts/check-facing.mjs --golden --all
 *   node scripts/check-facing.mjs --write-golden [--all]
 */
import { spawnSync } from "node:child_process";
import { facingSkip } from "./lib/facing-gate.mjs";

if (facingSkip()) {
  console.log("[facing] FACING_SKIP=1 — skipped");
  process.exit(0);
}

const args = process.argv.slice(2);
function run(script, extra = []) {
  const r = spawnSync("node", [script, ...extra], { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (args.includes("--write-golden")) {
  const extra = args.includes("--all") ? ["--write", "--all"] : ["--write"];
  run("scripts/check-facing-static.mjs");
  run("scripts/check-facing-golden.mjs", extra);
  process.exit(0);
}

if (args.includes("--diff")) {
  const extra = [];
  const bi = args.indexOf("--base");
  if (bi >= 0) extra.push("--base", args[bi + 1]);
  if (args.includes("--static-only")) extra.push("--static-only");
  run("scripts/check-facing-diff.mjs", extra);
  process.exit(0);
}

run("scripts/check-facing-static.mjs");

if (args.includes("--golden")) {
  const extra = args.filter((a) => a === "--all" || !a.startsWith("--"));
  // 只保留 --all 同 ids
  const gArgs = [];
  if (args.includes("--all")) gArgs.push("--all");
  for (const a of args) {
    if (!a.startsWith("--") && a !== "check-facing.mjs") gArgs.push(a);
  }
  run("scripts/check-facing-golden.mjs", gArgs);
}

console.log("\n[facing] all requested gates passed");
