// Batch 1 capture-page verification (mobile 390x844):
//   1A last-stand trigger, 1B chopsticks, 1C tap-spirit-to-clamp + pet button,
//   1D vibrate (cannot assert headless), 1E selfie overlay.
// Uses ?mode=3d to lock the 3D scene and ?ls=charge so the first clamp always enters struggle.
// Fake media flags let the selfie camera open headlessly.
// Run: node scripts/diag-capture-b1.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});

async function newPage() {
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
  return { context, page };
}

const cap = (page) => page.evaluate(() => (window.__cap ? window.__cap() : null));

async function pollUntil(page, pred, ms = 8000, step = 120) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await cap(page);
    if (s && pred(s)) return s;
    await page.waitForTimeout(step);
  }
  return null;
}

const results = {};
const { context, page } = await newPage();

// ── Aiming: chopsticks open + tap-spirit clamp target + pet button, no bottom 夾 button ──
await page.goto(`${BASE}/capture?species=oily-rice-chick&ls=charge&mode=3d&debug=1`, {
  waitUntil: "domcontentloaded",
});
await page.getByTestId("start").click({ timeout: 15000 });
await pollUntil(page, (s) => s.phase === "aiming");
// 等精靈遊走到鏡頭內（clamp 熱區跟 onScreen 出現）
await pollUntil(page, (s) => s.onScreen === true, 6000);
await page.waitForTimeout(400);
await page.screenshot({ path: "test-shots/b1-aiming.png" });
results.aiming = {
  clampTargets: await page.getByTestId("clamp").count(),
  petBtn: await page.getByTestId("pet").count(),
  bottomClampButtons: await page.evaluate(
    () => [...document.querySelectorAll("button.btn-gold")].filter((b) => /px-16/.test(b.className)).length
  ),
};

// ── Tap the spirit hit-area to clamp -> struggle (chopsticks snap closed) ──
for (let i = 0; i < 6; i++) {
  const clamp = page.getByTestId("clamp");
  if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
  const st = await pollUntil(page, (s) => s.phase === "struggle" || s.phase === "failed", 2000);
  if (st?.phase === "struggle") break;
}
await page.waitForTimeout(250);
await page.screenshot({ path: "test-shots/b1-struggle.png" });
results.struggle = await cap(page).then((s) => s?.phase);

// ── Mash to success ──
const mash = page.getByTestId("mash");
let last = null;
for (let i = 0; i < 300; i++) {
  if (i % 6 === 0) {
    last = await cap(page);
    if (last?.phase === "success" || last?.phase === "fled" || last?.phase === "failed") break;
  }
  if (await mash.count()) await mash.first().dispatchEvent("pointerdown").catch(() => {});
  await page.waitForTimeout(20);
}
await page.waitForTimeout(600);
results.success = await cap(page).then((s) => s?.phase);
await page.screenshot({ path: "test-shots/b1-success.png" });

// ── Selfie overlay ──
results.selfieOpenBtn = await page.getByTestId("selfie-open").count();
if (results.selfieOpenBtn) {
  await page.getByTestId("selfie-open").click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-shots/b1-selfie.png" });
  results.selfieUp = await page.getByTestId("selfie").count();
  // take the shot -> shows save/retake
  if (await page.getByTestId("selfie-shot").count()) {
    await page.getByTestId("selfie-shot").click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: "test-shots/b1-selfie-shot.png" });
  }
}

console.log(JSON.stringify(results, null, 2));
await context.close();
await browser.close();
