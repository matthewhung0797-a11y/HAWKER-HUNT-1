/** Facing gate 共用：敏感路徑、抽樣名單、skip 判斷 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

export const GOLDEN_DIR = "test-fixtures/facing-golden";
export const GOLDEN_SAMPLE = [
  "kopi-o-emperor",
  "satay-flame-emperor",
  "kaya-warrior",
  "bkt-warrior",
  "laksa-dragon",
  "kaya-dragon",
  "prata-pup",
  "oyster-immortal",
  "chwee-shogun",
  "nasi-lemak-general",
  "satay-warrior",
  "curry-puff-warrior",
];

/** 改到呢啲就觸發 B／C */
export const FACING_SENSITIVE_GLOBS = [
  "src/content/species.ts",
  "src/app/battle/page.tsx",
  "src/components/three/SpiritModel.tsx",
  "public/models/",
  "scripts/lib/facing-battle-lock.json",
  "test-fixtures/facing-golden/",
];

export function facingSkip() {
  return process.env.FACING_SKIP === "1" || process.env.FACING_SKIP === "true";
}

export function loadBattleLock(repoRoot = process.cwd()) {
  return JSON.parse(
    readFileSync(resolve(repoRoot, "scripts/lib/facing-battle-lock.json"), "utf8")
  );
}

/** git diff --name-only vs base（預設 origin/master…HEAD，冇 remote 就用 HEAD~1） */
export function listChangedFiles(base) {
  const candidates = [
    base,
    process.env.FACING_BASE,
    "origin/master",
    "master",
    "HEAD~1",
  ].filter(Boolean);

  let lastErr;
  for (const b of candidates) {
    try {
      const out = execSync(`git diff --name-only ${b}...HEAD`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    } catch (e) {
      lastErr = e;
    }
  }
  // 未 commit 工作區改動
  try {
    const out = execSync("git diff --name-only HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const staged = execSync("git diff --name-only --cached", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return [...new Set([...out.split(/\r?\n/), ...staged.split(/\r?\n/)])]
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (e) {
    throw lastErr || e;
  }
}

export function isFacingSensitive(file) {
  const f = file.replace(/\\/g, "/");
  return FACING_SENSITIVE_GLOBS.some((g) =>
    g.endsWith("/") ? f.startsWith(g) || f.includes(`/${g}`) : f === g || f.endsWith("/" + g)
  );
}

/** 由 diff 推斷要驗邊啲 species id */
export function affectedSpeciesIds(changedFiles, allIds) {
  const ids = new Set();
  let battleCore = false;
  for (const file of changedFiles) {
    const f = file.replace(/\\/g, "/");
    if (
      f === "src/app/battle/page.tsx" ||
      f === "src/components/three/SpiritModel.tsx" ||
      f === "scripts/lib/facing-battle-lock.json"
    ) {
      battleCore = true;
    }
    const m = f.match(/^public\/models\/([^/]+)\.glb$/);
    if (m) ids.add(m[1]);
  }
  if (battleCore) return { ids: allIds, battleCore: true };
  // species.ts 改咗：唔知邊隻——用 sample + 有改 GLB 嘅
  if (changedFiles.some((f) => f.replace(/\\/g, "/") === "src/content/species.ts")) {
    for (const id of GOLDEN_SAMPLE) ids.add(id);
  }
  return { ids: [...ids], battleCore: false };
}

export function glbHasTripoRoot(glbPath) {
  if (!existsSync(glbPath)) return false;
  const b = readFileSync(glbPath);
  if (b.length < 20 || b.toString("utf8", 0, 4) !== "glTF") return false;
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + len).toString("utf8"));
  return (json.nodes || []).some((n) => /tripo::Root/i.test(n.name || ""));
}

export function glbHasHips(glbPath) {
  if (!existsSync(glbPath)) return false;
  const b = readFileSync(glbPath);
  if (b.length < 20 || b.toString("utf8", 0, 4) !== "glTF") return false;
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + len).toString("utf8"));
  return (json.nodes || []).some((n) => n.name === "Hips" || /::Hips$/i.test(n.name || ""));
}
