// 面向閘接入 playtest：跑 facing:static，結果寫入 session（唔改 species／battle）
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendEvent,
  appendFeed,
  writeSessionMeta,
  sessionDir,
} from "../lib/run-io.mjs";

export function runFacingGate({ runDir }) {
  const personaId = "facing-static";
  sessionDir(runDir, personaId);
  const t0 = Date.now();

  console.log("[playtest:facing] ▶ npm run facing:static");
  const r = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "facing:static"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      shell: false,
    }
  );

  const out = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
  const logPath = join(runDir, "sessions", personaId, "facing-static.log");
  writeFileSync(logPath, out.slice(0, 200_000));

  const ok = r.status === 0;
  const errLines = out
    .split(/\r?\n/)
    .filter((l) => l.includes("✗") || l.includes("FAIL"))
    .slice(0, 20);

  appendEvent(runDir, personaId, {
    type: "step",
    stepId: "facing.static",
    ok,
    ms: Date.now() - t0,
    reason: ok ? undefined : `facing:static exit ${r.status}`,
    meta: { errorSample: errLines },
  });

  appendFeed(runDir, {
    personaId,
    label: "面向閘 A",
    stepId: "facing.static",
    text: ok
      ? "facing:static 全綠——註解／rigLite／battle 鎖 OK"
      : `facing:static 失敗（${errLines.length || "?"} 條樣例）。詳見 session log。硬閘獨立，playtest 只係匯報。`,
    sentiment: ok ? "positive" : "negative",
  });

  writeSessionMeta(runDir, personaId, {
    label: "面向閘 A（static）",
    status: ok ? "done" : "failed",
    durationMs: Date.now() - t0,
    path: "facing-gate",
    notes: [
      "Gate B/C（golden）要 :3000＋基線，另跑 npm run facing:golden",
      "playtest 唔改 modelYaw／lookAt",
    ],
  });

  // 可選：標記 summary 用
  appendEvent(runDir, personaId, {
    type: "facing_report",
    stepId: "facing.report",
    ok,
    exitCode: r.status,
    sample: errLines.slice(0, 8),
  });

  return { ok, exitCode: r.status };
}
