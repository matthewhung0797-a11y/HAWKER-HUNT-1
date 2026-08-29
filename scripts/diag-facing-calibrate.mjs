/**
 * 單隻／多隻面向校準：四個 modelYaw 候選各截玩家位，再對勝出角度截敵位核對。
 *
 * 正確玩家位 = 背向鏡頭（見唔到臉／胸口飾物）
 * 正確敵位   = 面向鏡頭（見臉／胸口／喙）
 *
 * Run: node scripts/diag-facing-calibrate.mjs <id[,id2,...]>
 * Out: test-shots/facing-cal/<id>-player-{0,+90,180,-90}.png
 *      test-shots/facing-cal/<id>-enemy-<winner>.png
 *
 * 揀完玩家位啱嘅角度後，改 species.ts 嘅 modelYaw，並加：
 *   // facing-lock: YYYY-MM-DD player-back enemy-face
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";
import { YAW_CANDIDATES } from "./lib/facing-species.mjs";

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;
const OUT = "test-shots/facing-cal";
mkdirSync(OUT, { recursive: true });

const ids = (process.argv[2] || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (ids.length === 0) {
  console.error("Usage: node scripts/diag-facing-calibrate.mjs <id[,id2,...]>");
  process.exit(1);
}

const REF = "kopi-o-emperor";
const now = Date.now();
const owned = [REF, ...ids].map((id, i) => ({
  uid: id,
  speciesId: id,
  level: 12,
  exp: 0,
  caughtAt: now - i * 1000,
  centreId: "lau-pa-sat",
}));

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

async function shotWithYaw(label, url, speciesId, yaw) {
  const ctx = await browser.newContext({
    viewport: { width: 780, height: 520 },
    locale: "zh-TW",
    deviceScaleFactor: 1.25,
  });
  await ctx.addInitScript(
    (d) => {
      localStorage.setItem(
        "hawker-hunt-save",
        JSON.stringify({
          state: {
            loggedIn: true,
            onboardingDone: true,
            nickname: "FacingCal",
            ownedSpirits: d.owned,
          },
          version: 0,
        })
      );
      localStorage.setItem("hh-battle-tut", "1");
      if (typeof d.yaw === "number") {
        window.__dbgYaw = d.yaw;
        window.__dbgYawFor = d.speciesId;
      }
    },
    { owned, yaw, speciesId }
  );
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page
    .locator("[data-basic-attack]:not([disabled])")
    .waitFor({ state: "visible", timeout: 22000 })
    .catch(() => {});
  await page.waitForTimeout(850);
  // 確認 dbgYaw 有生效
  const probe = await page.evaluate(() => ({
    y: window.__dbgYaw,
    f: window.__dbgYawFor,
  }));
  const path = `${OUT}/${label}.png`;
  await page.screenshot({ path });
  await ctx.close();
  return { path, probe };
}

const report = [];

for (const id of ids) {
  console.log(`\n=== calibrate ${id} ===`);
  const foe = id === REF ? "satay-flame-emperor" : REF;
  const playerShots = [];
  for (const [lab, val] of YAW_CANDIDATES) {
    const url = `${BASE}/battle?uid=${id}&enemy=${foe}&centre=lau-pa-sat`;
    const r = await shotWithYaw(`${id}-player-${lab}`, url, id, val);
    playerShots.push({ lab, val, ...r });
    console.log(`  player ${lab} → ${r.path} dbg=${JSON.stringify(r.probe)}`);
  }
  // 敵位四個都截，方便一次揀
  const enemyShots = [];
  for (const [lab, val] of YAW_CANDIDATES) {
    const url = `${BASE}/battle?uid=${foe}&enemy=${id}&centre=lau-pa-sat`;
    const r = await shotWithYaw(`${id}-enemy-${lab}`, url, id, val);
    enemyShots.push({ lab, val, ...r });
    console.log(`  enemy  ${lab} → ${r.path}`);
  }
  report.push({ id, playerShots, enemyShots });
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`\nDone. Read player-* shots: 背向鏡頭＝啱。同一 lab 嘅 enemy-* 應見正面。`);
console.log(`然後改 species.ts modelYaw，加 // facing-lock: ${new Date().toISOString().slice(0, 10)} player-back enemy-face`);
await browser.close();
