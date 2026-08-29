#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSummary } from "./lib/summary.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fails = [];
function must(rel) {
  if (!existsSync(join(root, rel))) fails.push(`缺檔 ${rel}`);
}
function mustContain(rel, needle) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    fails.push(`缺檔 ${rel}`);
    return;
  }
  if (!readFileSync(p, "utf8").includes(needle)) fails.push(`${rel} 缺「${needle}」`);
}

[
  "scripts/playtest/run.mjs",
  "scripts/playtest/lib/human.mjs",
  "scripts/playtest/suites/load-1k.mjs",
  "scripts/playtest/suites/human-loop.mjs",
  "scripts/playtest/suites/facing-gate.mjs",
  "src/app/admin/playtest/_components/PlaytestConsole.tsx",
  "src/app/api/admin/playtest/trigger/route.ts",
  "src/lib/playtest/runs.ts",
].forEach(must);

mustContain("scripts/playtest/run.mjs", "runLoad1k");
mustContain("scripts/playtest/run.mjs", "runHumanLoop");
mustContain("package.json", "playtest:1k");
mustContain("src/app/admin/playtest/_components/PlaytestConsole.tsx", "千人蜂群");
mustContain("scripts/playtest/suites/load-1k.mjs", "peakInFlight");

// load-1k 語法／匯出
const { runLoad1k } = await import("./suites/load-1k.mjs");
if (typeof runLoad1k !== "function") fails.push("runLoad1k 未匯出");

const demo = join(root, "scripts/playtest/fixtures/demo-run");
const sum = buildSummary(demo);
if (!sum.funnel || sum.funnel.sessions < 3) fails.push("demo summary sessions < 3");
if (!("facing" in sum)) fails.push("summary 應有 facing");

if (fails.length) {
  console.error("❌ playtest check 失敗");
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}
console.log("✅ playtest check：千人 load＋human＋控制室齊");
