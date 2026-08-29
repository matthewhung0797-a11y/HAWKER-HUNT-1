/**
 * 為 draft 三階自動截面向校準圖（玩家＋敵位 × 4 yaw），上傳 Storage，寫入 draft。
 *
 * 用法：
 *   DIAG_BASE=http://localhost:3000 node scripts/pipeline/facing-cal-shots.mjs <draftId>
 *
 * 需 public/models/{id}.glb 已存在；用 /dev/facing-lab（唔改 species.ts）。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { readDraft, writeDraft } from "./lib/draft.mjs";
import { uploadFacingCalPng, jobsDbConfigured } from "./lib/jobs-db.mjs";
import { upsertPetDraft } from "./lib/pets-db.mjs";
import { resolveDiagBase, logDiagBase } from "../lib/diag-base.mjs";

const YAWS = [
  ["0", 0],
  ["+90", Math.PI / 2],
  ["180", Math.PI],
  ["-90", -Math.PI / 2],
];

const draftId = process.argv[2];
if (!draftId) {
  console.error("usage: node scripts/pipeline/facing-cal-shots.mjs <draftId>");
  process.exit(1);
}

const draft = readDraft(draftId);
if (!draft) {
  console.error("搵唔到 draft", draftId);
  process.exit(1);
}

const list = draft.speciesList ?? [];
if (list.length < 1) {
  console.error("draft 冇 speciesList");
  process.exit(1);
}

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;
const OUT = resolve("test-shots/facing-cal-pipeline", draftId);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const facingCalByStage = {};

async function shot(url, filePath) {
  const ctx = await browser.newContext({
    viewport: { width: 720, height: 480 },
    deviceScaleFactor: 1.1,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch(() =>
    page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
  );
  await page
    .waitForFunction(
      () => window.__facingLabReady === true && (window.__facingLabMeshes ?? 0) > 0,
      null,
      { timeout: 45000 }
    )
    .catch(() => {});
  await page.waitForTimeout(1400);
  await page.screenshot({ path: filePath });
  await ctx.close();
}

for (const sp of list) {
  const model =
    sp.modelUrl ||
    draft.artifacts?.finalByStage?.[sp.id]?.replace(/^public/, "") ||
    `/models/${sp.id}.glb`;
  const glbFs = model.startsWith("/") ? `public${model}` : model;
  if (!existsSync(glbFs)) {
    console.warn(`  skip ${sp.id}：缺 GLB ${glbFs}`);
    continue;
  }
  const h = sp.modelHeightM ?? 0.5;
  const rigLite = sp.rigLite ? "1" : "0";
  const animated = sp.animated === false ? "0" : "1";
  const shots = {};

  console.log(`\n=== facing-cal ${sp.id} ===`);
  for (const [lab] of YAWS) {
    const q = `id=${encodeURIComponent(sp.id)}&model=${encodeURIComponent(model)}&yaw=${encodeURIComponent(lab)}&h=${h}&rigLite=${rigLite}&animated=${animated}`;
    const playerFile = `${sp.id}-player-${lab}.png`;
    const enemyFile = `${sp.id}-enemy-${lab}.png`;
    const playerPath = resolve(OUT, playerFile);
    const enemyPath = resolve(OUT, enemyFile);

    await shot(`${BASE}/dev/facing-lab?${q}&side=player`, playerPath);
    await shot(`${BASE}/dev/facing-lab?${q}&side=enemy`, enemyPath);
    console.log(`  ${lab} player+enemy ok`);

    let playerStorage = null;
    let enemyStorage = null;
    if (jobsDbConfigured) {
      playerStorage = await uploadFacingCalPng(draftId, playerPath, playerFile);
      enemyStorage = await uploadFacingCalPng(draftId, enemyPath, enemyFile);
    }
    shots[lab] = {
      playerPath: playerStorage,
      enemyPath: enemyStorage,
      localPlayer: playerPath.replaceAll("\\", "/"),
      localEnemy: enemyPath.replaceAll("\\", "/"),
    };
  }
  facingCalByStage[sp.id] = {
    shots,
    at: new Date().toISOString(),
  };
}

await browser.close();

draft.artifacts = {
  ...(draft.artifacts ?? {}),
  facingCalByStage,
};
draft.manifest = {
  ...(draft.manifest ?? {}),
  facingCalByStage,
};
writeDraft(draft);
writeFileSync(resolve(OUT, "index.json"), JSON.stringify(facingCalByStage, null, 2));

const up = await upsertPetDraft(draft);
console.log(
  `\n✅ facingCalByStage 已寫入 draft；pets upsert=${JSON.stringify(up)}；本地 ${OUT}`
);
console.log("後台揀 yaw → POST /api/admin/spirits/facing-lock");
