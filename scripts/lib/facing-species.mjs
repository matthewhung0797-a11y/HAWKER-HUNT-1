/** 由 species.ts 抽所有有 modelUrl 嘅 id 同而家 modelYaw 標籤 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const YAW_LABEL = (expr) => {
  if (!expr) return "0";
  const t = expr.replace(/\s+/g, " ").trim();
  if (t === "0") return "0";
  if (t.includes("-") && t.includes("PI") && t.includes("/")) return "-PI/2";
  if (t.includes("PI") && t.includes("/")) return "+PI/2";
  if (t === "Math.PI") return "PI";
  if (t === "-Math.PI") return "-PI";
  return t;
};

/**
 * modelUrl 路徑即 species id（`/models/<id>.glb`）。
 * skills 亦有 id 欄，唔可以「向前搵最近 id」。
 */
export function listGlbSpecies(repoRoot = process.cwd()) {
  const src = readFileSync(resolve(repoRoot, "src/content/species.ts"), "utf8");
  const out = [];
  const urlRe = /modelUrl:\s*"\/models\/([^"]+)\.glb"/g;
  let m;
  while ((m = urlRe.exec(src))) {
    const id = m[1];
    // modelYaw／facing-lock 通常喺 modelUrl 前後幾行
    const win = src.slice(Math.max(0, m.index - 200), m.index + 450);
    const yawM = win.match(/modelYaw:\s*([^,\n]+)/);
    const locked = /facing-lock:/.test(win);
    out.push({
      id,
      modelUrl: `/models/${id}.glb`,
      yawLabel: YAW_LABEL(yawM?.[1]),
      yawExpr: yawM?.[1]?.trim() || "0",
      locked,
      animated: /animated:\s*true/.test(win),
      rigLite: /rigLite:\s*true/.test(win),
    });
  }
  const seen = new Set();
  return out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

/** 校準用四個候選 */
export const YAW_CANDIDATES = [
  ["0", 0],
  ["+90", Math.PI / 2],
  ["180", Math.PI],
  ["-90", -Math.PI / 2],
];
