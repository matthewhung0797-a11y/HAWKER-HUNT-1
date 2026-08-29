#!/usr/bin/env node
// 結構閘：確保後台驗證卡＋API＋硬閘接線齊（唔燒 credits、唔開瀏覽器）
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const fails = [];

function mustExist(rel) {
  if (!existsSync(resolve(root, rel))) fails.push(`缺檔: ${rel}`);
}

function mustContain(rel, needles, label) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    fails.push(`缺檔: ${rel}`);
    return;
  }
  const text = readFileSync(p, "utf8");
  for (const n of needles) {
    if (!text.includes(n)) fails.push(`${label || rel}: 缺少「${n}」`);
  }
}

mustExist("src/lib/pipeline/review-gates.ts");
mustExist("src/app/api/admin/spirits/review-gate/route.ts");
mustExist("src/app/admin/spirits/_components/SpiritReviewPanels.tsx");

mustContain(
  "src/lib/pipeline/review-gates.ts",
  ["ART_CHECK_KEYS", "MODEL_CHECK_KEYS", "canContinue3d", "canApproveHumanGates"],
  "review-gates"
);

mustContain(
  "src/app/api/admin/spirits/continue-3d/route.ts",
  ["canContinue3d"],
  "continue-3d"
);

mustContain(
  "src/app/api/admin/spirits/decision/route.ts",
  ["canApproveHumanGates"],
  "decision"
);

mustContain(
  "src/lib/pipeline/playability.ts",
  ["artReview", "modelReview"],
  "playability"
);

mustContain(
  "src/app/admin/spirits/_components/SpiritPipeline.tsx",
  [
    "ArtReviewPanel",
    "Model3dReviewPanel",
    "GateSummary",
    "reviewGates?.art?.verified",
    "reviewGates?.model3d?.verified",
    "③ 面向驗證",
  ],
  "SpiritPipeline"
);

mustContain(
  "src/app/admin/spirits/_components/SpiritReviewPanels.tsx",
  [
    "① 立繪驗證",
    "② 3D 驗證",
    "確認立繪通過",
    "確認 3D 通過",
    "/api/admin/spirits/review-gate",
  ],
  "SpiritReviewPanels"
);

// 純邏輯：allChecksTrue 語意（同 TS 對齊）
const ART = ["fullBody", "faceOk", "styleOk", "cleanCutout"];
const MODEL = ["meshOk", "groundOk", "weaponOrFormOk", "matchArt"];
function allTrue(keys, checks) {
  return keys.every((k) => checks[k] === true);
}
if (allTrue(ART, { fullBody: true, faceOk: true, styleOk: true, cleanCutout: false })) {
  fails.push("邏輯：立繪缺一項應唔過");
}
if (!allTrue(ART, { fullBody: true, faceOk: true, styleOk: true, cleanCutout: true })) {
  fails.push("邏輯：立繪齊勾應過");
}
if (allTrue(MODEL, { meshOk: true, groundOk: true, weaponOrFormOk: true, matchArt: false })) {
  fails.push("邏輯：3D 缺一項應唔過");
}
if (!allTrue(MODEL, { meshOk: true, groundOk: true, weaponOrFormOk: true, matchArt: true })) {
  fails.push("邏輯：3D 齊勾應過");
}

if (fails.length) {
  console.error("❌ check-review-gates 失敗：");
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log("✅ check-review-gates：後台驗證卡／API／硬閘接線齊");
