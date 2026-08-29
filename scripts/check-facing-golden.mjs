/**
 * Facing Gate C — 視覺 golden 回歸
 *
 * 截玩家位＋敵位，同 test-fixtures/facing-golden/ 比對（裁切中心區降 UI 噪訊）。
 *
 * Run:
 *   node scripts/check-facing-golden.mjs              # 抽樣對比（要 :3000）
 *   node scripts/check-facing-golden.mjs --all         # 全量
 *   node scripts/check-facing-golden.mjs --write       # 寫／更新 baseline（抽樣）
 *   node scripts/check-facing-golden.mjs --write --all
 *   node scripts/check-facing-golden.mjs id1 id2
 *
 * Skip: FACING_SKIP=1
 * 門檻: FACING_GOLDEN_MAX_MAD（預設 18，0–255 mean abs diff）
 */
import { chromium } from "playwright";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";
import { listGlbSpecies } from "./lib/facing-species.mjs";
import {
  facingSkip,
  GOLDEN_DIR,
  GOLDEN_SAMPLE,
} from "./lib/facing-gate.mjs";

if (facingSkip()) {
  console.log("[facing-golden] FACING_SKIP=1 — skipped");
  process.exit(0);
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const all = args.includes("--all");
const idsArg = args.filter((a) => !a.startsWith("--"));
const MAX_MAD = Number(process.env.FACING_GOLDEN_MAX_MAD || 18);

const allSpecies = listGlbSpecies();
const allIds = allSpecies.map((s) => s.id);
let targets;
if (idsArg.length) targets = idsArg;
else if (all) targets = allIds;
else targets = GOLDEN_SAMPLE.filter((id) => allIds.includes(id));

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;

mkdirSync(GOLDEN_DIR, { recursive: true });
mkdirSync("test-shots/facing-golden-run", { recursive: true });

const REF_PLAYER = "kopi-o-emperor";
const REF_ENEMY = "satay-flame-emperor";
const now = Date.now();
const ownedIds = new Set([REF_PLAYER, REF_ENEMY, ...targets]);
const owned = [...ownedIds].map((id, i) => ({
  uid: id,
  speciesId: id,
  level: 12,
  exp: 0,
  caughtAt: now - i * 1000,
  centreId: "lau-pa-sat",
}));

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 780, height: 520 },
  locale: "zh-TW",
  deviceScaleFactor: 1.25,
});
await context.addInitScript(
  (data) => {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({
        state: {
          loggedIn: true,
          onboardingDone: true,
          nickname: "FacingGolden",
          ownedSpirits: data.owned,
        },
        version: 0,
      })
    );
    localStorage.setItem("hh-battle-tut", "1");
  },
  { owned }
);
const page = await context.newPage();

async function settle(url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page
    .locator("[data-basic-attack]:not([disabled])")
    .waitFor({ state: "visible", timeout: 22000 })
    .catch(() => {});
  await page.waitForTimeout(900);
}

/** 裁切角色區：玩家偏左下、敵位偏中右 */
async function spiritCrop(pngPath, side) {
  const img = sharp(pngPath);
  const meta = await img.metadata();
  const w = meta.width || 975;
  const h = meta.height || 650;
  if (side === "player") {
    return img
      .extract({
        left: Math.floor(w * 0.02),
        top: Math.floor(h * 0.18),
        width: Math.floor(w * 0.42),
        height: Math.floor(h * 0.62),
      })
      .resize(200, 200, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  return img
    .extract({
      left: Math.floor(w * 0.32),
      top: Math.floor(h * 0.08),
      width: Math.floor(w * 0.48),
      height: Math.floor(h * 0.58),
    })
    .resize(200, 200, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function mad(a, b) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

const failures = [];
const report = [];

for (const id of targets) {
  const foeAsEnemy = id === REF_ENEMY ? REF_PLAYER : REF_ENEMY;
  const meAsEnemyFoe = id === REF_PLAYER ? REF_ENEMY : REF_PLAYER;

  for (const [side, url] of [
    [
      "player",
      `${BASE}/battle?uid=${id}&enemy=${foeAsEnemy}&centre=lau-pa-sat`,
    ],
    [
      "enemy",
      `${BASE}/battle?uid=${meAsEnemyFoe}&enemy=${id}&centre=lau-pa-sat`,
    ],
  ]) {
    const runPath = `test-shots/facing-golden-run/${id}__${side}.png`;
    const goldPath = resolve(GOLDEN_DIR, `${id}__${side}.png`);
    await settle(url);
    await page.screenshot({ path: runPath });

    if (write) {
      copyFileSync(runPath, goldPath);
      // 另存裁切預覽方便人手睇
      const cropWebp = resolve(GOLDEN_DIR, `${id}__${side}.crop.webp`);
      const { data, info: cinfo } = await spiritCrop(runPath, side);
      await sharp(data, {
        raw: { width: cinfo.width, height: cinfo.height, channels: cinfo.channels },
      })
        .webp({ quality: 80 })
        .toFile(cropWebp);
      console.log(`  write ${goldPath}`);
      report.push({ id, side, action: "write" });
      continue;
    }

    if (!existsSync(goldPath)) {
      failures.push(`${id}/${side}: 冇 golden（先跑 --write 產 baseline）`);
      continue;
    }

    const cur = await spiritCrop(runPath, side);
    const gold = await spiritCrop(goldPath, side);
    const score = mad(cur.data, gold.data);
    const ok = score <= MAX_MAD;
    report.push({ id, side, mad: Number(score.toFixed(2)), ok });
    console.log(
      `  ${id.padEnd(26)} ${side.padEnd(6)} MAD=${score.toFixed(1).padStart(5)} ${ok ? "OK" : "FAIL"}`
    );
    if (!ok) {
      failures.push(
        `${id}/${side}: MAD ${score.toFixed(1)} > ${MAX_MAD}（畫面偏離 golden；有意改就 --write）`
      );
    }
  }
}

await browser.close();

writeFileSync(
  resolve(GOLDEN_DIR, "last-run.json"),
  JSON.stringify(
    { at: new Date().toISOString(), write, maxMad: MAX_MAD, report, failures },
    null,
    2
  )
);

if (write) {
  writeFileSync(
    resolve(GOLDEN_DIR, "manifest.json"),
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        ids: targets,
        note: "產自 check-facing-golden --write；改 battle 幾何或 model 後要重產",
      },
      null,
      2
    )
  );
  console.log(`\n[facing-golden] wrote ${targets.length} ids → ${GOLDEN_DIR}/`);
  process.exit(0);
}

if (failures.length) {
  console.error(`\n[facing-golden] FAIL — ${failures.length}:\n`);
  for (const f of failures) console.error(" ✗", f);
  process.exit(1);
}
console.log(`\n[facing-golden] OK — ${targets.length} ids, maxMAD≤${MAX_MAD}`);
