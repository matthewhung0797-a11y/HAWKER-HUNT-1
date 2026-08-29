#!/usr/bin/env node
// 混合 playtest：
//   npm run playtest:1k     → 1000 輕量同時湧入
//   npm run playtest:human  → 高仿真 Chrome（思考／手殘／打穿）
//   npm run playtest:all    → facing + load + human
import { resolveDiagBase } from "../lib/diag-base.mjs";
import { personasByIds, PERSONAS } from "./personas.mjs";
import { createRun, finalizeRun } from "./lib/run-io.mjs";
import { buildSummary } from "./lib/summary.mjs";
import { runCoreLoop } from "./suites/core-loop.mjs";
import { runCaptureMatrix } from "./suites/capture-matrix.mjs";
import { runBattleSmoke } from "./suites/battle-smoke.mjs";
import { runFacingGate } from "./suites/facing-gate.mjs";
import { runLoad1k } from "./suites/load-1k.mjs";
import { runHumanLoop } from "./suites/human-loop.mjs";

const args = process.argv.slice(2);
function flag(name, def) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
function has(name) {
  return args.includes(`--${name}`);
}

const suiteArg = flag("suite", "human");
const suiteList =
  suiteArg === "all"
    ? ["facing", "load", "human"]
    : suiteArg.split(",").map((s) => s.trim()).filter(Boolean);

const personaArg = flag(
  "personas",
  suiteArg === "all" || suiteArg === "human"
    ? "newbie,clumsy,speedrun"
    : "newbie,clumsy,speedrun,completionist,battler"
);
const personas = personasByIds(
  personaArg === "all"
    ? PERSONAS.map((p) => p.id)
    : personaArg.split(",").map((s) => s.trim()).filter(Boolean)
);
const presetRunId = flag("run-id", null);
const loadN = Number(flag("n", "1000")) || 1000;
const loadConc = Number(flag("concurrency", "120")) || 120;
const humanConc = Number(flag("human-concurrency", "2")) || 2;

const needsServer = suiteList.some((s) => s !== "facing");

let base = "";
let source = "none";
if (needsServer && !has("skip-server")) {
  const resolved = await resolveDiagBase({ startHint: true });
  base = resolved.base;
  source = resolved.source;
  console.log(`[playtest] base=${base} (${source}) suites=${suiteList.join(",")}`);
  try {
    await fetch(base, { signal: AbortSignal.timeout(4000) });
  } catch {
    console.error(`[playtest] 連唔到 ${base}——請先 npm run dev`);
    process.exit(2);
  }
} else {
  console.log(`[playtest] suites=${suiteList.join(",")}（無需／跳過 server）`);
}

const { id, dir } = createRun({
  suite: suiteArg,
  suites: suiteList,
  personas,
  base,
  runId: presetRunId,
});
console.log(`[playtest] runId=${id}`);

let status = "done";
try {
  for (const s of suiteList) {
    console.log(`\n[playtest] === suite: ${s} ===`);
    if (s === "core-loop") await runCoreLoop({ runDir: dir, personas, base });
    else if (s === "human")
      await runHumanLoop({ runDir: dir, personas, base, concurrency: humanConc });
    else if (s === "capture") await runCaptureMatrix({ runDir: dir, base });
    else if (s === "battle") await runBattleSmoke({ runDir: dir, base });
    else if (s === "facing") runFacingGate({ runDir: dir });
    else if (s === "load")
      await runLoad1k({ runDir: dir, base, n: loadN, concurrency: loadConc });
    else throw new Error(`未知 suite: ${s}`);
  }
} catch (e) {
  console.error("[playtest] suite 失敗", e);
  status = "failed";
}

const summary = buildSummary(dir);
if (
  summary.funnel.completionRate < 1 ||
  summary.facing?.staticOk === false ||
  (summary.load && summary.load.errorRate > 0.05)
) {
  if (status === "done") status = "done_with_findings";
}
finalizeRun(dir, summary, status);
console.log(
  `\n[playtest] 完成 ${id} status=${status} 完成率=${(summary.funnel.completionRate * 100).toFixed(0)}% load=${summary.load ? `${summary.load.completed}/${summary.load.target}` : "—"} facing=${summary.facing?.staticOk}`
);
console.log(`[playtest] → playtest-runs/${id}/summary.json`);
console.log(`[playtest] 後台：/admin/playtest`);
