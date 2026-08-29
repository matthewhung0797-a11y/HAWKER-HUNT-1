// Yaw sweep for target species in /battle: overrides modelYaw via window.__dbgYaw
// (only for the species whose url matches __dbgYawFor) to find the yaw that faces the enemy
// (correct = model shows its BACK to the camera). Outputs test-shots/sweep/<id>-<label>.png
// Run: node scripts/diag-yaw-sweep.mjs <id[,id2,...]>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;
const targets = (process.argv[2] || "oyster-immortal").split(",");
mkdirSync("test-shots/sweep", { recursive: true });
const P = Math.PI;
const yaws = [
  ["0", 0],
  ["+90", P / 2],
  ["180", P],
  ["-90", -P / 2],
];

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
for (const target of targets) {
  for (const [label, val] of yaws) {
    const context = await browser.newContext({ viewport: { width: 900, height: 520 }, locale: "zh-TW", deviceScaleFactor: 1.5 });
    await context.addInitScript(
      (d) => {
        localStorage.setItem(
          "hawker-hunt-save",
          JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T", ownedSpirits: d.owned }, version: 0 })
        );
        localStorage.setItem("hh-battle-tut", "1");
        window.__dbgYaw = d.val;
        window.__dbgYawFor = d.target;
      },
      { owned: [{ uid: target, speciesId: target, level: 15, exp: 0, caughtAt: Date.now(), centreId: "kreta-ayer" }], val, target }
    );
    const page = await context.newPage();
    await page.goto(`${BASE}/battle?uid=${target}`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-basic-attack]:not([disabled])").waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(650);
    await page.screenshot({ path: `test-shots/sweep/${target}-${label}.png` });
    await context.close();
  }
  console.log(`swept ${target}`);
}
await browser.close();
