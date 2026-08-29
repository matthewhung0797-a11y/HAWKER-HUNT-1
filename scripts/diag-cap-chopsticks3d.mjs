// 第 3 項驗證：筷子搬入 3D 場景（mode=3d，mobile 390x844）
//   截 aiming（筷尖微張）、snap（鉗攏）、struggle（夾住震顫）三張，
//   肉眼確認：木色 3D 筷子有透視、後筷被精靈遮住、筷尖掂身體兩側唔穿模。
// Run: node scripts/diag-cap-chopsticks3d.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  deviceScaleFactor: 2,
  permissions: ["camera"],
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

const cap = (p) => p.evaluate(() => (window.__cap ? window.__cap() : null));
async function pollUntil(p, pred, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await cap(p);
    if (s && pred(s)) return s;
    await p.waitForTimeout(step);
  }
  return null;
}

const results = {};
await page.goto(`${BASE}/capture?species=oily-rice-chick&ls=charge&mode=3d`, {
  waitUntil: "domcontentloaded",
});
await page.getByTestId("start").click({ timeout: 15000 });
await pollUntil(page, (s) => s.phase === "aiming");
await pollUntil(page, (s) => s.onScreen === true, 6000);
await page.waitForTimeout(500);
await page.screenshot({ path: "test-shots/chop3d-aiming.png" });
results.aiming = (await cap(page))?.phase;

// 撳精靈夾：snap 一刻（鉗攏）— clamp→struggle 有 ~220ms 窗口
const clamp = page.getByTestId("clamp");
if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(120);
await page.screenshot({ path: "test-shots/chop3d-snap.png" });

// struggle：夾住震顫（精靈 frozen 置中，最清楚睇筷尖／遮擋）
await pollUntil(page, (s) => s.phase === "struggle" || s.phase === "failed", 3000);
await page.waitForTimeout(400);
await page.screenshot({ path: "test-shots/chop3d-struggle.png" });
results.struggle = (await cap(page))?.phase;

console.log(JSON.stringify(results, null, 2));
await context.close();
await browser.close();
