// 層1：1000 輕量虛擬玩家「同時在線」——唔開 Chromium，打真 HTTP／analytics。
// 目標：最短時間做出峰值併發 ≈ N，收集延遲／錯誤／事件流。
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  appendEvent,
  appendFeed,
  writeSessionMeta,
  sessionDir,
} from "../lib/run-io.mjs";
import { rand, randInt } from "../lib/human.mjs";

const SPECIES = [
  "little-orh-luak",
  "little-laksa",
  "oily-rice-chick",
  "omelette-warrior",
  "kaya-warrior",
];

function playerKey(i) {
  return `pt-load-${String(i).padStart(4, "0")}`;
}

async function poolMap(items, concurrency, fn) {
  const ret = new Array(items.length);
  let idx = 0;
  let inFlight = 0;
  let peak = 0;
  await new Promise((resolve, reject) => {
    let done = 0;
    const next = () => {
      if (done === items.length) return resolve();
      while (inFlight < concurrency && idx < items.length) {
        const i = idx++;
        inFlight++;
        peak = Math.max(peak, inFlight);
        Promise.resolve()
          .then(() => fn(items[i], i))
          .then((v) => {
            ret[i] = v;
          })
          .catch(reject)
          .finally(() => {
            inFlight--;
            done++;
            next();
          });
      }
    };
    next();
  });
  return { results: ret, peak };
}

async function timed(fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - t0, value };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e?.message?.slice(0, 120) };
  }
}

function pickJourney() {
  const species = SPECIES[randInt(0, SPECIES.length - 1)];
  const winCap = Math.random() < 0.72;
  const winBat = Math.random() < 0.55;
  return { species, winCap, winBat };
}

async function runAgent(base, i, startedAt) {
  // 錯開起步：前 ~4s 內全部「入場」，模擬同時湧入
  await new Promise((r) => setTimeout(r, Math.min(4000, i * 3 + rand(0, 40))));

  const key = playerKey(i);
  const j = pickJourney();
  const latencies = [];
  const events = [];
  const pushEv = (event, props = {}) => {
    events.push({
      event,
      props,
      ts: new Date().toISOString(),
      player_key: key,
      app_version: "0.1.0-playtest",
      platform: Math.random() < 0.55 ? "mobile" : "desktop",
    });
  };

  pushEv("app_open", { referrer: "playtest-load-1k", locale: "zh" });
  pushEv("capture_start", {
    speciesId: j.species,
    centreId: "maxwell",
    arMode: "3d",
  });
  if (j.winCap) {
    pushEv("capture_success", {
      speciesId: j.species,
      centreId: "maxwell",
      arMode: "3d",
      shiny: Math.random() < 0.02,
      level: randInt(1, 8),
      stage: 1,
    });
  } else {
    pushEv("capture_fail", {
      speciesId: j.species,
      centreId: "maxwell",
      arMode: "3d",
    });
  }
  pushEv("battle_start", {
    enemySpeciesId: "omelette-warrior",
    playerSpeciesId: j.species,
  });
  if (j.winBat) {
    pushEv("battle_win", {
      enemySpeciesId: "omelette-warrior",
      playerSpeciesId: j.species,
      hadAdvantage: Math.random() < 0.4,
    });
  } else {
    pushEv("battle_lose", {
      enemySpeciesId: "omelette-warrior",
      playerSpeciesId: j.species,
    });
  }
  if (Math.random() < 0.25) pushEv("leaderboard_view", { tab: "weekly" });

  // 思考／操作時間（重疊中 = 同時在玩）
  await new Promise((r) => setTimeout(r, rand(200, 900)));

  const pages = ["/", "/map", "/capture", "/battle"];
  const pagePath = pages[randInt(0, pages.length - 1)];
  const getR = await timed(async () => {
    const res = await fetch(`${base}${pagePath}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "x-playtest-agent": key },
    });
    if (!res.ok && res.status >= 500) throw new Error(`GET ${pagePath} ${res.status}`);
    return res.status;
  });
  latencies.push(getR.ms);

  // analytics 可分兩批（≤100）
  const postR = await timed(async () => {
    const res = await fetch(`${base}/api/analytics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`analytics ${res.status}`);
    const j2 = await res.json().catch(() => ({}));
    return j2;
  });
  latencies.push(postR.ms);

  pushEv("session_end", { durationMs: Date.now() - startedAt });
  const endR = await timed(async () => {
    const res = await fetch(`${base}/api/analytics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            event: "session_end",
            props: { durationMs: Date.now() - startedAt },
            ts: new Date().toISOString(),
            player_key: key,
            app_version: "0.1.0-playtest",
            platform: "mobile",
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`session_end ${res.status}`);
  });
  latencies.push(endR.ms);

  const ok = getR.ok && postR.ok;
  return {
    id: key,
    i,
    status: ok ? "done" : "failed",
    lastEvent: j.winCap ? "capture_success" : "capture_fail",
    winCap: j.winCap,
    winBat: j.winBat,
    species: j.species,
    ms: latencies.reduce((a, b) => a + b, 0),
    latencies,
    error: ok ? null : getR.error || postR.error || endR.error,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

/**
 * @param {{ runDir: string, base: string, n?: number, concurrency?: number }} opts
 */
export async function runLoad1k({ runDir, base, n = 1000, concurrency = 120 }) {
  const personaId = "load-swarm";
  sessionDir(runDir, personaId);
  const loadDir = join(runDir, "load");
  mkdirSync(loadDir, { recursive: true });

  const t0 = Date.now();
  const agents = Array.from({ length: n }, (_, i) => i);
  console.log(`[playtest:load] ▶ ${n} agents concurrency=${concurrency} → ${base}`);

  appendFeed(runDir, {
    personaId,
    label: "千人湧入",
    stepId: "load.start",
    text: `${n} 個輕量玩家同時入場（峰值併發請求池 ${concurrency}）`,
    sentiment: "neutral",
  });

  const { results, peak } = await poolMap(agents, concurrency, (i) => runAgent(base, i, t0));
  const windowMs = Date.now() - t0;
  const flatLat = results.flatMap((r) => r.latencies || []).sort((a, b) => a - b);
  const failed = results.filter((r) => r.status !== "done");
  const capOk = results.filter((r) => r.winCap).length;
  const batOk = results.filter((r) => r.winBat).length;

  const report = {
    schemaVersion: 1,
    mode: "lightweight-http",
    target: n,
    completed: results.length - failed.length,
    failed: failed.length,
    peakInFlight: peak,
    concurrencyCap: concurrency,
    windowMs,
    p50Ms: percentile(flatLat, 50),
    p95Ms: percentile(flatLat, 95),
    p99Ms: percentile(flatLat, 99),
    errorRate: results.length ? failed.length / results.length : 0,
    captureSuccessRate: results.length ? capOk / results.length : 0,
    battleWinRate: results.length ? batOk / results.length : 0,
    note:
      "輕量虛擬玩家：真打頁面＋/api/analytics，模擬同時在線。高仿真 Chrome 另見 human／core-loop sessions。",
    agents: results.map((r) => ({
      id: r.id,
      status: r.status,
      lastEvent: r.lastEvent,
      ms: r.ms,
      error: r.error,
    })),
  };

  writeFileSync(join(loadDir, "report.json"), JSON.stringify(report, null, 2));
  // UI 用精簡 snapshot（避免巨型 JSON 每次全傳——agents 仍保留）
  writeFileSync(
    join(loadDir, "swarm-meta.json"),
    JSON.stringify({
      target: n,
      completed: report.completed,
      failed: report.failed,
      peakInFlight: peak,
      windowMs,
      errorRate: report.errorRate,
    })
  );

  const ok = report.errorRate < 0.05 && report.completed >= n * 0.95;
  appendEvent(runDir, personaId, {
    type: "step",
    stepId: "load.1k",
    ok,
    ms: windowMs,
    meta: {
      peak,
      errorRate: report.errorRate,
      p95Ms: report.p95Ms,
      completed: report.completed,
      target: n,
    },
  });
  appendFeed(runDir, {
    personaId,
    label: "千人湧入",
    stepId: "load.1k",
    text: ok
      ? `千人潮完成：${report.completed}/${n}，峰值 in-flight ${peak}，p95 ${report.p95Ms}ms`
      : `千人潮有壓力：失敗 ${report.failed}，errorRate ${(report.errorRate * 100).toFixed(1)}%，p95 ${report.p95Ms}ms`,
    sentiment: ok ? "positive" : "negative",
  });

  writeSessionMeta(runDir, personaId, {
    label: "千人輕量湧入",
    status: ok ? "done" : "failed",
    durationMs: windowMs,
    path: "load-1k",
    notes: [
      `${n} agents · peakInFlight=${peak}`,
      `capture成功率 ${(report.captureSuccessRate * 100).toFixed(0)}%`,
    ],
  });

  console.log(
    `[playtest:load] ✔ completed=${report.completed}/${n} peak=${peak} p95=${report.p95Ms}ms err=${(report.errorRate * 100).toFixed(1)}%`
  );
  return report;
}
