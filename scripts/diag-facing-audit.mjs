/**
 * 全量面向審計：每隻 GLB 精靈截「玩家位」＋「敵位」各一張。
 *
 * 正確：
 *   玩家位 = 背向鏡頭、身體對敵（見唔到臉／胸口飾物）
 *   敵位   = 面向玩家／鏡頭（見臉／胸口／喙）
 *
 * Run:
 *   node scripts/diag-facing-audit.mjs              # 全部
 *   node scripts/diag-facing-audit.mjs laksa-dragon # 指定
 *   node scripts/diag-facing-audit.mjs --sample     # 抽樣
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";
import { listGlbSpecies } from "./lib/facing-species.mjs";

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;
const OUT = "test-shots/facing-audit";
mkdirSync(OUT, { recursive: true });

const REF_PLAYER = "kopi-o-emperor"; // 敵位測試時固定玩家
const REF_ENEMY = "satay-flame-emperor"; // 玩家位測試時固定對手（目標撞名就互換）

const all = listGlbSpecies();
let targets;
if (process.argv[2] === "--sample") {
  targets = all.filter((s) =>
    [
      "laksa-dragon",
      "kaya-dragon",
      "satay-flame-emperor",
      "kopi-o-emperor",
      "bkt-grandmaster",
      "chwee-shogun",
      "nasi-lemak-general",
      "otah-pyrolord-chong",
    ].includes(s.id)
  );
} else if (process.argv.length > 2) {
  const want = new Set(process.argv.slice(2));
  targets = all.filter((s) => want.has(s.id));
} else {
  targets = all;
}

console.log(`auditing ${targets.length} / ${all.length} GLB species → ${OUT}/`);

const now = Date.now();
const ownedIds = new Set([REF_PLAYER, REF_ENEMY, ...targets.map((t) => t.id)]);
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
await context.addInitScript((data) => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: {
        loggedIn: true,
        onboardingDone: true,
        nickname: "FacingAudit",
        ownedSpirits: data.owned,
      },
      version: 0,
    })
  );
  localStorage.setItem("hh-battle-tut", "1");
}, { owned });

const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 120)));

const manifest = [];

async function settleBattle(url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const ok = await page
    .locator("[data-basic-attack]:not([disabled])")
    .waitFor({ state: "visible", timeout: 22000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(800);
  return ok;
}

for (const sp of targets) {
  // 避免自己打自己：玩家位對手／敵位我方都要係另一隻
  const foeAsEnemy = sp.id === REF_ENEMY ? REF_PLAYER : REF_ENEMY;
  const meAsEnemyFoe = sp.id === REF_PLAYER ? REF_ENEMY : REF_PLAYER;
  const asPlayerUrl = `${BASE}/battle?uid=${sp.id}&enemy=${foeAsEnemy}&centre=lau-pa-sat`;
  const asEnemyUrl = `${BASE}/battle?uid=${meAsEnemyFoe}&enemy=${sp.id}&centre=lau-pa-sat`;

  const okP = await settleBattle(asPlayerUrl);
  const playerPath = `${OUT}/${sp.id}__player.png`;
  await page.screenshot({ path: playerPath });

  const okE = await settleBattle(asEnemyUrl);
  const enemyPath = `${OUT}/${sp.id}__enemy.png`;
  await page.screenshot({ path: enemyPath });

  const row = {
    id: sp.id,
    yaw: sp.yawLabel,
    locked: sp.locked,
    playerOk: okP,
    enemyOk: okE,
    playerShot: playerPath,
    enemyShot: enemyPath,
  };
  manifest.push(row);
  console.log(
    `${sp.id.padEnd(28)} yaw=${sp.yawLabel.padEnd(6)} player=${okP ? "ok" : "FAIL"} enemy=${okE ? "ok" : "FAIL"}`
  );
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), manifest }, null, 2));
console.log(`\nWrote ${OUT}/manifest.json — 用 Read 目視：玩家背／敵位面。見臉＠玩家或見背＠敵位 → 跑 diag-facing-calibrate.mjs`);
await browser.close();
