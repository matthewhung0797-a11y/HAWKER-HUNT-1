// 自拍 smoke：捉到精靈後開「同精靈自拍」，確認 gyro 改動冇整爛 overlay，3D 精靈仍渲染。
// headless 冇 device orientation → GyroCamera 收唔到讀數 → worldAnchorRef 保持 null →
// SelfieSpirit3d 自動退回螢幕錨定分支（graceful fallback），精靈照樣顯示。
// Run: node scripts/diag-selfie-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
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
const cap = () => page.evaluate(() => (window.__cap ? window.__cap() : null));
async function pollUntil(pred, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await cap();
    if (s && pred(s)) return s;
    await page.waitForTimeout(step);
  }
  return null;
}
async function tapAt(x, y) {
  await page.evaluate(
    ([px, py]) => {
      const el = document.querySelector('[data-testid="hold"]');
      if (!el) return;
      const opts = { pointerId: 1, pointerType: "touch", clientX: px, clientY: py, bubbles: true };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
    },
    [x, y]
  );
}

await page.goto(`${BASE}/capture?species=oily-rice-chick&mode=3d&debug=1&ls=charge`, {
  waitUntil: "domcontentloaded",
});
await page.getByTestId("start").click({ timeout: 15000 });
await pollUntil((s) => s.phase === "aiming");
for (let i = 0; i < 8; i++) {
  const clamp = page.getByTestId("clamp");
  if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
  const st = await pollUntil((s) => s.phase === "struggle" || s.phase === "failed", 2500);
  if (st?.phase === "struggle") break;
}
// 狂撳到捉到
for (let i = 0; i < 60; i++) {
  const s = await cap();
  if (!s || s.phase !== "struggle") break;
  await tapAt(s.trackX, s.trackY);
  await page.waitForTimeout(40);
}
const won = await pollUntil((s) => s.phase === "caught", 5000);
console.log("捕捉結果 phase =", won?.phase ?? (await cap())?.phase);

const openBtn = page.getByTestId("selfie-open");
await openBtn.waitFor({ state: "visible", timeout: 8000 });
await openBtn.click();
const selfie = page.getByTestId("selfie");
await selfie.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(1500); // 等 3D canvas + 模型 render
await page.screenshot({ path: "test-shots/selfie-gyro-smoke.png" });

// gyro 模式：拖動層應該收起（selfie-drag 唔存在）
const dragCount = await page.getByTestId("selfie-drag").count();
const hint = await page
  .evaluate(() => document.querySelector('[data-testid="selfie"] .rounded-full')?.textContent?.trim() ?? null)
  .catch(() => null);
console.log(JSON.stringify({ selfieOpen: true, dragLayerHidden: dragCount === 0, hint }, null, 2));
await browser.close();
