// 後台只讀 playtest-runs／fixture——唔寫遊戲 store、唔打正式 API。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const RUNS = join(ROOT, "playtest-runs");
const FIXTURE = join(ROOT, "scripts/playtest/fixtures/demo-run");

function readJsonl(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as unknown;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function safeId(id: string) {
  return Boolean(id) && !id.includes("..") && !id.includes("/") && !id.includes("\\");
}

export function resolvePlaytestRunDir(runId: string): string | null {
  if (!safeId(runId)) return null;
  if (runId === "demo-run") {
    return existsSync(join(FIXTURE, "manifest.json")) ? FIXTURE : null;
  }
  const dir = join(RUNS, runId);
  return existsSync(join(dir, "manifest.json")) ? dir : null;
}

export function listPlaytestRuns(): {
  id: string;
  source: "local" | "fixture";
  status?: string;
  suite?: string;
  createdAt?: string;
  finishedAt?: string;
  completionRate?: number;
  sessions?: number;
  demo?: boolean;
}[] {
  const out: ReturnType<typeof listPlaytestRuns> = [];

  if (existsSync(RUNS)) {
    for (const name of readdirSync(RUNS)) {
      const dir = join(RUNS, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manPath = join(dir, "manifest.json");
      if (!existsSync(manPath)) continue;
      let manifest: Record<string, unknown> = {};
      let summary: { funnel?: { completionRate?: number; sessions?: number } } = {};
      try {
        manifest = JSON.parse(readFileSync(manPath, "utf8")) as Record<string, unknown>;
      } catch {
        /* skip */
      }
      if (existsSync(join(dir, "summary.json"))) {
        try {
          summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) as typeof summary;
        } catch {
          /* empty */
        }
      }
      out.push({
        id: name,
        source: "local",
        status: String(manifest.status ?? "unknown"),
        suite: String(manifest.suite ?? ""),
        createdAt: manifest.createdAt as string | undefined,
        finishedAt: manifest.finishedAt as string | undefined,
        completionRate: summary.funnel?.completionRate,
        sessions: summary.funnel?.sessions,
      });
    }
  }

  if (existsSync(join(FIXTURE, "manifest.json"))) {
    let manifest: Record<string, unknown> = {};
    let summary: { funnel?: { completionRate?: number; sessions?: number } } = {};
    try {
      manifest = JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8")) as Record<
        string,
        unknown
      >;
      summary = JSON.parse(readFileSync(join(FIXTURE, "summary.json"), "utf8")) as typeof summary;
    } catch {
      /* empty */
    }
    out.push({
      id: "demo-run",
      source: "fixture",
      status: String(manifest.status ?? "done"),
      suite: String(manifest.suite ?? "core-loop"),
      createdAt: manifest.createdAt as string | undefined,
      finishedAt: manifest.finishedAt as string | undefined,
      completionRate: summary.funnel?.completionRate,
      sessions: summary.funnel?.sessions,
      demo: true,
    });
  }

  return out.sort((a, b) => String(b.createdAt ?? b.id).localeCompare(String(a.createdAt ?? a.id)));
}

export function loadPlaytestRun(runId: string) {
  const dir = resolvePlaytestRunDir(runId);
  if (!dir) return null;

  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Record<
    string,
    unknown
  >;
  let summary: Record<string, unknown> = {};
  if (existsSync(join(dir, "summary.json"))) {
    summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) as Record<string, unknown>;
  }
  const feed = readJsonl(join(dir, "feed.jsonl")) as {
    at?: string;
    personaId?: string;
    label?: string;
    stepId?: string;
    text?: string;
    sentiment?: string;
    shot?: string;
  }[];

  const sessionsDir = join(dir, "sessions");
  const sessions: {
    personaId: string;
    meta: Record<string, unknown>;
    events: unknown[];
    lastShot: string | null;
  }[] = [];

  if (existsSync(sessionsDir)) {
    for (const pid of readdirSync(sessionsDir)) {
      const sdir = join(sessionsDir, pid);
      let meta: Record<string, unknown> = {};
      if (existsSync(join(sdir, "meta.json"))) {
        meta = JSON.parse(readFileSync(join(sdir, "meta.json"), "utf8")) as Record<string, unknown>;
      }
      const events = readJsonl(join(sdir, "events.jsonl")) as {
        shot?: string;
        stepId?: string;
      }[];
      const lastShot =
        [...events].reverse().find((e) => e.shot)?.shot ??
        (existsSync(join(sdir, "shots"))
          ? (() => {
              const shots = readdirSync(join(sdir, "shots")).filter((f) => f.endsWith(".png"));
              return shots.length ? `sessions/${pid}/shots/${shots[shots.length - 1]}` : null;
            })()
          : null);
      sessions.push({ personaId: pid, meta, events, lastShot });
    }
  }

  let load: Record<string, unknown> | null = null;
  const loadPath = join(dir, "load", "report.json");
  if (existsSync(loadPath)) {
    try {
      const full = JSON.parse(readFileSync(loadPath, "utf8")) as {
        agents?: { id: string; status: string; lastEvent?: string }[];
        target?: number;
        completed?: number;
        failed?: number;
        peakInFlight?: number;
        windowMs?: number;
        p50Ms?: number;
        p95Ms?: number;
        errorRate?: number;
        captureSuccessRate?: number;
        battleWinRate?: number;
        note?: string;
      };
      // 控制室蜂群：最多帶 1000 個點位狀態（唔帶巨型 latencies）
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
        agents: (full.agents ?? []).slice(0, 1000).map((a) => ({
          id: a.id,
          status: a.status,
          lastEvent: a.lastEvent,
        })),
      };
    } catch {
      load = null;
    }
  }

  return {
    id: runId,
    dir: resolve(dir),
    manifest,
    summary,
    feed,
    sessions,
    load,
  };
}

/** 只准讀 run 目錄內相對路徑（shots） */
export function resolvePlaytestAsset(runId: string, relPath: string): string | null {
  const dir = resolvePlaytestRunDir(runId);
  if (!dir || !relPath || relPath.includes("..")) return null;
  const norm = relPath.replace(/\\/g, "/").replace(/^\//, "");
  if (!norm.startsWith("sessions/") || !/\.(png|jpg|webp|jsonl?)$/i.test(norm)) return null;
  const abs = join(dir, norm);
  if (!abs.startsWith(dir) || !existsSync(abs)) return null;
  return abs;
}
