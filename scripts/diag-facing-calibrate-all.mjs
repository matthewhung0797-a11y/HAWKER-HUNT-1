/**
 * 全量四角校準：每隻 GLB 喺玩家位截 0/+90/180/-90（__dbgYaw 覆蓋）。
 * 之後目視揀「背向鏡頭」嗰格 → 寫入 species.ts + facing-lock。
 *
 * Run: node scripts/diag-facing-calibrate-all.mjs
 * Out: test-shots/facing-cal/<id>-player-{0,+90,180,-90}.png
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";
import { listGlbSpecies, YAW_CANDIDATES } from "./lib/facing-species.mjs";

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;
const OUT = "test-shots/facing-cal";
mkdirSync(OUT, { recursive: true });

const all = listGlbSpecies();
const only = process.argv.slice(2);
const targets = only.length ? all.filter((s) => only.includes(s.id)) : all;

const REF = "kopi-o-emperor";
const REF2 = "satay-flame-emperor";
const now = Date.now();
const owned = [REF, REF2, ...targets.map((t) => t.id)].map((id, i) => ({
  uid: id,
  speciesId: id,
  level: 12,
  exp: 0,
  caughtAt: now - i * 1000,
  centreId: "lau-pa-sat",
}));

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const summary = [];

for (const sp of targets) {
  const foe = sp.id === REF ? REF2 : REF;
  console.log(`\n=== ${sp.id} (current ${sp.yawLabel}) ===`);
  const shots = [];
  for (const [lab, val] of YAW_CANDIDATES) {
    const ctx = await browser.newContext({
      viewport: { width: 700, height: 480 },
      locale: "zh-TW",
      deviceScaleFactor: 1.2,
    });
    await ctx.addInitScript(
      (d) => {
        localStorage.setItem(
          "hawker-hunt-save",
          JSON.stringify({
            state: {
              loggedIn: true,
              onboardingDone: true,
              nickname: "Cal",
              ownedSpirits: d.owned,
            },
            version: 0,
          })
        );
        localStorage.setItem("hh-battle-tut", "1");
        window.__dbgYaw = d.yaw;
        window.__dbgYawFor = d.id;
      },
      { owned, yaw: val, id: sp.id }
    );
    const page = await ctx.newPage();
    await page.goto(`${BASE}/battle?uid=${sp.id}&enemy=${foe}&centre=lau-pa-sat`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .locator("[data-basic-attack]:not([disabled])")
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    const path = `${OUT}/${sp.id}-player-${lab}.png`;
    await page.screenshot({ path });
    shots.push({ lab, val, path });
    console.log(`  ${lab}`);
    await ctx.close();
  }
  summary.push({ id: sp.id, current: sp.yawLabel, shots });
}

writeFileSync(`${OUT}/all-summary.json`, JSON.stringify(summary, null, 2));
console.log(`\nDone ${targets.length} species → ${OUT}/`);
console.log("Pick player shot with BACK to camera; that lab → modelYaw.");
await browser.close();
