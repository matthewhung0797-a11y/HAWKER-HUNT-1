// playtest 資料層：只寫 playtest-runs/，唔掂遊戲內容／正式 DB。
import {
  mkdirSync,
  appendFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PLAYTEST_RUNS_DIR = join(ROOT, "playtest-runs");
export const FIXTURES_DIR = join(ROOT, "scripts/playtest/fixtures");

export function newRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `run-${stamp}-${rand}`;
}

export function createRun({
  suite = "core-loop",
  personas = [],
  base = "",
  runId = null,
  suites = null,
} = {}) {
  const id = runId && /^run-[\w-]+$/.test(runId) ? runId : newRunId();
  const dir = join(PLAYTEST_RUNS_DIR, id);
  mkdirSync(join(dir, "sessions"), { recursive: true });
  const manifest = {
    id,
    suite,
    suites: suites ?? [suite],
    personas: personas.map((p) => (typeof p === "string" ? p : p.id)),
    base,
    createdAt: new Date().toISOString(),
    status: "running",
    schemaVersion: 1,
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, "feed.jsonl"), "");
  return { id, dir, manifest };
}

export function sessionDir(runDir, personaId) {
  const d = join(runDir, "sessions", personaId);
  mkdirSync(join(d, "shots"), { recursive: true });
  const eventsPath = join(d, "events.jsonl");
  if (!existsSync(eventsPath)) writeFileSync(eventsPath, "");
  return d;
}

export function appendEvent(runDir, personaId, event) {
  const dir = sessionDir(runDir, personaId);
  const row = {
    at: new Date().toISOString(),
    personaId,
    ...event,
  };
  appendFileSync(join(dir, "events.jsonl"), JSON.stringify(row) + "\n");
  return row;
}

export function appendFeed(runDir, entry) {
  const row = {
    at: new Date().toISOString(),
    ...entry,
  };
  appendFileSync(join(runDir, "feed.jsonl"), JSON.stringify(row) + "\n");
  return row;
}

export async function saveShot(page, runDir, personaId, stepId) {
  const dir = sessionDir(runDir, personaId);
  const safe = String(stepId).replace(/[^\w.-]+/g, "_");
  const rel = `sessions/${personaId}/shots/${safe}.png`;
  const abs = join(runDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  try {
    await page.screenshot({ path: abs, type: "png" });
    return rel;
  } catch {
    return null;
  }
}

export function writeSessionMeta(runDir, personaId, meta) {
  const dir = sessionDir(runDir, personaId);
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
}

export function finalizeRun(runDir, summary, status = "done") {
  const manPath = join(runDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manPath, "utf8"));
  manifest.status = status;
  manifest.finishedAt = new Date().toISOString();
  writeFileSync(manPath, JSON.stringify(manifest, null, 2));
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
}

export function listRunDirs() {
  const out = [];
  if (existsSync(PLAYTEST_RUNS_DIR)) {
    for (const name of readdirSync(PLAYTEST_RUNS_DIR)) {
      const dir = join(PLAYTEST_RUNS_DIR, name);
      if (existsSync(join(dir, "manifest.json"))) out.push({ id: name, dir, source: "local" });
    }
  }
  const demo = join(FIXTURES_DIR, "demo-run");
  if (existsSync(join(demo, "manifest.json"))) {
    out.push({ id: "demo-run", dir: demo, source: "fixture" });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

export function resolveRunDir(runId) {
  if (!runId || runId.includes("..") || runId.includes("/") || runId.includes("\\")) {
    return null;
  }
  if (runId === "demo-run") {
    const demo = join(FIXTURES_DIR, "demo-run");
    return existsSync(join(demo, "manifest.json")) ? demo : null;
  }
  const dir = join(PLAYTEST_RUNS_DIR, runId);
  return existsSync(join(dir, "manifest.json")) ? dir : null;
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function copyFixtureToRuns(name = "demo-run") {
  const src = join(FIXTURES_DIR, name);
  if (!existsSync(join(src, "manifest.json"))) throw new Error(`缺 fixture: ${name}`);
  const destId = `${name}-copy-${Date.now().toString(36)}`;
  const dest = join(PLAYTEST_RUNS_DIR, destId);
  mkdirSync(dest, { recursive: true });
  // shallow copy known files + sessions
  for (const f of ["manifest.json", "summary.json", "feed.jsonl"]) {
    const p = join(src, f);
    if (existsSync(p)) copyFileSync(p, join(dest, f));
  }
  const sessSrc = join(src, "sessions");
  if (existsSync(sessSrc)) {
    for (const pid of readdirSync(sessSrc)) {
      const from = join(sessSrc, pid);
      const to = join(dest, "sessions", pid);
      mkdirSync(join(to, "shots"), { recursive: true });
      for (const f of readdirSync(from)) {
        if (f === "shots") continue;
        const fp = join(from, f);
        if (existsSync(fp) && !readdirSync(from).includes(f + "/")) {
          try {
            copyFileSync(fp, join(to, f));
          } catch {
            /* dir */
          }
        }
      }
      for (const f of ["events.jsonl", "meta.json"]) {
        if (existsSync(join(from, f))) copyFileSync(join(from, f), join(to, f));
      }
    }
  }
  return { id: destId, dir: dest };
}
