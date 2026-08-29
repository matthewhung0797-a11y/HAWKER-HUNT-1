// 第 2 項驗證：自拍改跟捕捉狀態（3D 為主）（mobile 390x844）
//   捕捉成功 → 開自拍 → 確認透明 R3F Canvas render 3D 精靈疊喺（fake）相機畫面 →
//   撳 selfie-shot 合成，確認合成圖有精靈。
//   fake media flags 令前置相機 headless 開得到。
// Run: node scripts/diag-cap-selfie.mjs
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
async function hold(p, x, y, id, type) {
  await p.evaluate(
    ({ x, y, id, type }) => {
      const el = document.querySelector('[data-testid="hold"]');
      if (!el) return;
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id, clientX: x, clientY: y,
          bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true,
        })
      );
    },
    { x, y, id, type }
  );
}

const results = {};
await page.goto(`${BASE}/capture?species=oily-rice-chick&ls=charge&mode=3d&debug=1`, {
  waitUntil: "domcontentloaded",
});
await page.getByTestId("start").click({ timeout: 15000 });
await pollUntil(page, (s) => s.phase === "aiming");
await pollUntil(page, (s) => s.onScreen === true, 6000);
for (let i = 0; i < 8; i++) {
  const clamp = page.getByTestId("clamp");
  if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
  const st = await pollUntil(page, (s) => s.phase === "struggle" || s.phase === "failed", 1500);
  if (st?.phase === "struggle") break;
}
// 按住到成功
let s = await cap(page);
await hold(page, s.trackX, s.trackY, 1, "pointerdown");
for (let i = 0; i < 400; i++) {
  s = await cap(page);
  if (!s || s.phase === "success" || s.phase === "fled" || s.phase === "failed") break;
  await hold(page, s.trackX, s.trackY, 1, "pointermove");
  await page.waitForTimeout(30);
}
await hold(page, s?.trackX ?? 0, s?.trackY ?? 0, 1, "pointerup");
await page.waitForTimeout(500);
results.reached = (await cap(page))?.phase;

// 開自拍
results.selfieOpenBtn = await page.getByTestId("selfie-open").count();
if (results.selfieOpenBtn) {
  await page.getByTestId("selfie-open").click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000); // 等相機＋R3F canvas render 3D 精靈
  results.selfieUp = await page.getByTestId("selfie").count();
  results.dragLayer = await page.getByTestId("selfie-drag").count();
  results.selfieCanvas = await page.evaluate(
    () => document.querySelectorAll('[data-testid="selfie"] canvas').length
  );
  const bubbleSel = '[data-testid="selfie"] .bubble-pop';
  // 等對白泡泡出現
  results.bubbleSeen = false;
  for (let i = 0; i < 20; i++) {
    if (await page.locator(bubbleSel).count()) {
      results.bubbleSeen = true;
      results.bubbleText = await page.locator(bubbleSel).first().innerText().catch(() => null);
      break;
    }
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: "test-shots/selfie-3d.png" });
  // 隔一陣再截，對比精靈有冇走位（活潑漫步）
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-shots/selfie-3d-move.png" });
  // 影相前確保當下有泡泡（要影埋入相）
  for (let i = 0; i < 25; i++) {
    if (await page.locator(bubbleSel).count()) break;
    await page.waitForTimeout(150);
  }
  if (await page.getByTestId("selfie-shot").count()) {
    await page.getByTestId("selfie-shot").click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    results.composed = await page.evaluate(
      () => !!document.querySelector('[data-testid="selfie"] img[src^="data:image"]')
    );
    await page.screenshot({ path: "test-shots/selfie-3d-shot.png" });
  }
}

console.log(JSON.stringify(results, null, 2));
await context.close();
await browser.close();
