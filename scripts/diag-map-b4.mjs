// Batch 4: map wandering spirits are catchable — tap a wanderer -> /capture?species=...
// Run: node scripts/diag-map-b4.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  deviceScaleFactor: 2,
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });

// 等地圖 load 造出遊走精靈 DOM（.spirit-bob 內層可撳目標）
let count = 0;
for (let i = 0; i < 40; i++) {
  count = await page.locator(".spirit-bob").count();
  if (count > 0) break;
  await page.waitForTimeout(300);
}
await page.waitForTimeout(3500); // 等開場 flyTo，遊走精靈現形
await page.screenshot({ path: "test-shots/b4-map.png" });

const results = { wanderers: count };
// 讀第一隻遊走精靈嘅 title（應含「捉佢！」）
results.firstTitle = await page.locator(".spirit-bob").first().getAttribute("title").catch(() => null);
results.pointerEvents = await page
  .locator(".spirit-bob")
  .first()
  .evaluate((el) => getComputedStyle(el).pointerEvents)
  .catch(() => null);

// 撳落去 → 應導航去 /capture?species=
await page.locator(".spirit-bob").first().dispatchEvent("click").catch(() => {});
await page.waitForTimeout(1200);
results.url = page.url();
results.wentToCapture = /\/capture\?species=/.test(page.url());

console.log(JSON.stringify(results, null, 2));
await context.close();
await browser.close();
