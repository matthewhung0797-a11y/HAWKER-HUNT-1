// 由 events／feed 砌 summary（規則引擎；唔依賴 LLM）
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonl } from "./run-io.mjs";

function readSessionEvents(runDir, personaId) {
  return readJsonl(join(runDir, "sessions", personaId, "events.jsonl"));
}

export function buildSummary(runDir) {
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(runDir, "manifest.json"), "utf8"));
  } catch {
    /* empty */
  }

  const sessionsDir = join(runDir, "sessions");
  const personaIds = existsSync(sessionsDir)
    ? readdirSync(sessionsDir).filter((n) => existsSync(join(sessionsDir, n, "events.jsonl")))
    : manifest.personas ?? [];

  const sessions = [];
  const stuckCounts = {};
  const failReasons = {};
  let completed = 0;
  let failed = 0;
  let totalStepsOk = 0;
  let totalSteps = 0;

  for (const pid of personaIds) {
    const events = readSessionEvents(runDir, pid);
    let meta = {};
    const metaPath = join(runDir, "sessions", pid, "meta.json");
    if (existsSync(metaPath)) {
      try {
        meta = JSON.parse(readFileSync(metaPath, "utf8"));
      } catch {
        /* empty */
      }
    }

    const steps = events.filter((e) => e.type === "step");
    const oks = steps.filter((e) => e.ok === true);
    const fails = steps.filter((e) => e.ok === false);
    totalSteps += steps.length;
    totalStepsOk += oks.length;

    for (const f of fails) {
      const key = f.stepId || f.reason || "unknown";
      stuckCounts[key] = (stuckCounts[key] || 0) + 1;
      if (f.reason) failReasons[f.reason] = (failReasons[f.reason] || 0) + 1;
    }

    const status = meta.status || (fails.length ? "failed" : steps.length ? "done" : "empty");
    if (status === "done" || status === "completed") completed += 1;
    if (status === "failed" || fails.length) failed += 1;

    const last = events[events.length - 1];
    sessions.push({
      personaId: pid,
      label: meta.label || pid,
      status,
      steps: steps.length,
      stepsOk: oks.length,
      durationMs: meta.durationMs ?? null,
      lastStepId: last?.stepId ?? null,
      lastShot: [...events].reverse().find((e) => e.shot)?.shot ?? null,
      notes: meta.notes ?? [],
    });
  }

  const feed = readJsonl(join(runDir, "feed.jsonl"));
  const sentiment = { negative: 0, neutral: 0, positive: 0 };
  for (const f of feed) {
    const s = f.sentiment || "neutral";
    if (sentiment[s] != null) sentiment[s] += 1;
    else sentiment.neutral += 1;
  }

  const stuckTop = Object.entries(stuckCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([stepId, count]) => ({ stepId, count }));

  const themes = clusterThemes(feed, stuckTop);

  let facingOk = null;
  for (const pid of personaIds) {
    const events = readSessionEvents(runDir, pid);
    const fr = events.find((e) => e.type === "facing_report" || e.stepId === "facing.static");
    if (fr && typeof fr.ok === "boolean") facingOk = fr.ok;
  }

  const priorities = [];
  if (facingOk === false) {
    priorities.push({
      level: "P0",
      title: "面向閘 A（facing:static）未過",
      detail: "補 facing-lock／rigLite；或跑 diag-facing-calibrate + apply-facing-lock",
      stepId: "facing.static",
    });
  }
  for (const s of stuckTop.slice(0, 5)) {
    priorities.push({
      level: s.count >= 3 ? "P0" : s.count >= 2 ? "P1" : "P2",
      title: `卡點：${s.stepId}`,
      detail: `${s.count} 個 session 失敗／卡住`,
      stepId: s.stepId,
    });
  }
  for (const t of themes.slice(0, 5)) {
    if (priorities.some((p) => p.title.includes(t.theme))) continue;
    priorities.push({
      level: t.count >= 3 ? "P1" : "P2",
      title: t.theme,
      detail: t.sample || `${t.count} 條反饋`,
    });
  }

  let load = null;
  const loadPath = join(runDir, "load", "report.json");
  if (existsSync(loadPath)) {
    try {
      const full = JSON.parse(readFileSync(loadPath, "utf8"));
      load = {
        target: full.target,
        completed: full.completed,
        failed: full.failed,
        peakInFlight: full.peakInFlight,
        windowMs: full.windowMs,
        p50Ms: full.p50Ms,
        p95Ms: full.p95Ms,
        errorRate: full.errorRate,
        captureSuccessRate: full.captureSuccessRate,
        battleWinRate: full.battleWinRate,
        note: full.note,
      };
      if (full.errorRate > 0.05) {
        priorities.unshift({
          level: "P0",
          title: "千人湧入錯誤率偏高",
          detail: `errorRate=${(full.errorRate * 100).toFixed(1)}% p95=${full.p95Ms}ms`,
          stepId: "load.1k",
        });
      }
    } catch {
      /* empty */
    }
  }

  const highFidelity = sessions.filter((s) => {
    const metaPath = join(runDir, "sessions", s.personaId, "meta.json");
    if (!existsSync(metaPath)) return false;
    try {
      return JSON.parse(readFileSync(metaPath, "utf8")).fidelity === "high";
    } catch {
      return false;
    }
  }).length;

  return {
    schemaVersion: 1,
    runId: manifest.id,
    suite: manifest.suite,
    suites: manifest.suites ?? [manifest.suite],
    generatedAt: new Date().toISOString(),
    funnel: {
      sessions: personaIds.length,
      completed,
      failed,
      completionRate: personaIds.length ? completed / personaIds.length : 0,
      stepSuccessRate: totalSteps ? totalStepsOk / totalSteps : 0,
      highFidelitySessions: highFidelity,
    },
    load,
    facing: {
      staticOk: facingOk,
      note:
        facingOk == null
          ? "今次 run 未跑 facing-gate suite"
          : facingOk
            ? "Gate A 通過"
            : "Gate A 失敗（詳見 facing-static session）",
    },
    stuckTop,
    failReasons,
    sentiment,
    themes,
    priorities,
    sessions,
    feedCount: feed.length,
    coverageGaps: [
      "AR／SLAM／真陀螺儀（要真機）",
      "GPS 打卡 geofence（要真機）",
      "iOS／Android 分享入相簿（要真機）",
      load == null ? "今次未跑千人輕量湧入（npm run playtest:1k）" : null,
      facingOk == null ? "今次未跑 facing:static" : null,
      "facing Gate B/C golden（要 :3000＋基線）",
      "千人層＝HTTP 虛擬玩家；高仿真 Chrome 另計（並行有限）",
    ].filter(Boolean),
    notes:
      "混合模型：load≈同時千人；human/core＝真人感瀏覽器。規則總結（非 LLM）。",
  };
}

function clusterThemes(feed, stuckTop) {
  const buckets = {};
  const bump = (theme, sample) => {
    if (!buckets[theme]) buckets[theme] = { theme, count: 0, sample };
    buckets[theme].count += 1;
    if (sample && !buckets[theme].sample) buckets[theme].sample = sample;
  };
  for (const f of feed) {
    const text = `${f.text || ""} ${f.stepId || ""}`.toLowerCase();
    if (/面向|facing|側身|背/.test(text)) bump("面向／站位睇落怪", f.text);
    else if (/捕捉|夾|狂撳|縮圈|miss|逃走|閃走/.test(text)) bump("捕捉手感／失敗", f.text);
    else if (/導覽|教學|唔知|睇唔明|文案/.test(text)) bump("導覽／文案唔明", f.text);
    else if (/切磋|戰鬥|能量|閃避/.test(text)) bump("切磋節奏／能量", f.text);
    else if (/卡|死|timeout|error/.test(text)) bump("卡死／錯誤", f.text);
    else bump("其他體驗", f.text);
  }
  for (const s of stuckTop) {
    if (/onb|onboarding/.test(s.stepId)) bump("導覽／文案唔明", s.stepId);
    if (/capture|aim|mash|struggle/.test(s.stepId)) bump("捕捉手感／失敗", s.stepId);
    if (/battle|dodge/.test(s.stepId)) bump("切磋節奏／能量", s.stepId);
    if (/facing/.test(s.stepId)) bump("面向／站位睇落怪", s.stepId);
  }
  return Object.values(buckets).sort((a, b) => b.count - a.count);
}
