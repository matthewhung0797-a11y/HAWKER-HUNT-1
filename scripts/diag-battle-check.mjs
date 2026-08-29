// Render /battle for given species; screenshot idle + mid-attack to inspect facing + anim.
// Run: node scripts/diag-battle-check.mjs [species...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;
const CASES = process.argv.slice(2).length ? process.argv.slice(2) : ["oyster-immortal", "omelette-warrior"];

const now = Date.now();
const owned = CASES.map((id, i) => ({ uid: id, speciesId: id, level: 15, exp: 0, caughtAt: now - i * 1000, centreId: "kreta-ayer" }));

mkdirSync("test-shots/battle", { recursive: true });
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 900, height: 520 }, locale: "zh-TW", deviceScaleFactor: 1.5 });
await context.addInitScript((data) => {
  localStorage.setItem("hawker-hunt-save", JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T", ownedSpirits: data.owned }, version: 0 }));
  localStorage.setItem("hh-battle-tut", "1");
}, { owned });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

for (const id of CASES) {
  await page.goto(`${BASE}/battle?uid=${id}`, { waitUntil: "domcontentloaded" });
  const btn = page.locator("[data-basic-attack]:not([disabled])");
  const ok = await btn.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-shots/battle/${id}-idle.png` });
  // trigger basic attack, capture mid-swing
  await btn.dispatchEvent("pointerdown").catch(() => {});
  await btn.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(350);
  await page.screenshot({ path: `test-shots/battle/${id}-attack.png` });
  console.log(id, "reachedPlayerPhase=", ok);
}
await browser.close();
