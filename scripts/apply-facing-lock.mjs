/**
 * 按 JSON 決策表寫入 species.ts 嘅 modelYaw + facing-lock 註解。
 *
 * Input: test-shots/facing-cal/decisions.json
 * [
 *   { "id": "laksa-dragon", "yaw": "0" },
 *   { "id": "satay-flame-emperor", "yaw": "+90" },
 *   ...
 * ]
 * yaw 標籤：0 | +90 | -90 | 180
 *
 * Run: node scripts/apply-facing-lock.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DECISIONS = resolve("test-shots/facing-cal/decisions.json");
const SPECIES = resolve("src/content/species.ts");
const LOCK = `facing-lock: 2026-08-02 player-back enemy-face`;

const YAW_EXPR = {
  0: "0",
  "+90": "Math.PI / 2",
  "-90": "-Math.PI / 2",
  180: "Math.PI",
  PI: "Math.PI",
  "-PI": "-Math.PI",
};

const decisions = JSON.parse(readFileSync(DECISIONS, "utf8"));
let src = readFileSync(SPECIES, "utf8");
let changed = 0;

for (const d of decisions) {
  const expr = YAW_EXPR[d.yaw];
  if (expr === undefined) {
    console.error("bad yaw", d);
    process.exit(1);
  }
  const url = `modelUrl: "/models/${d.id}.glb"`;
  const idx = src.indexOf(url);
  if (idx < 0) {
    console.error("missing modelUrl for", d.id);
    continue;
  }
  // 由 modelUrl 起向後 500 字元改 modelYaw；冇就插入
  const head = src.slice(0, idx);
  const tail = src.slice(idx);
  const windowEnd = 500;
  const win = tail.slice(0, windowEnd);
  const rest = tail.slice(windowEnd);

  let newWin;
  if (/modelYaw:\s*[^,\n]+/.test(win)) {
    newWin = win.replace(
      /modelYaw:\s*[^,\n]+/,
      `modelYaw: ${expr}`
    );
    // 確保有 facing-lock 註解喺 modelYaw 上一行
    if (!newWin.includes("facing-lock:")) {
      newWin = newWin.replace(
        /(\n\s*)(modelYaw:)/,
        `$1// ${LOCK}\n$1$2`
      );
    } else {
      newWin = newWin.replace(/facing-lock:[^\n]*/, LOCK);
      // 清 apply 重跑時可能留低嘅空行
      newWin = newWin.replace(/(\/\/ facing-lock:[^\n]*\n)\s*\n(\s*modelYaw:)/, "$1$2");
    }
  } else {
    // 插喺 modelUrl 塊尾（animated／modelHeightM 之後常見）
    newWin = win.replace(
      /(modelUrl:\s*"[^"]+",)/,
      `$1\n    // ${LOCK}\n    modelYaw: ${expr},`
    );
  }

  if (newWin === win) {
    console.log("no change?", d.id);
    continue;
  }
  src = head + newWin + rest;
  changed++;
  console.log(`set ${d.id} → ${d.yaw} (${expr})`);
}

writeFileSync(SPECIES, src);
console.log(`\nUpdated ${changed} / ${decisions.length} entries in species.ts`);
