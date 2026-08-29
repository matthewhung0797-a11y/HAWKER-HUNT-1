// 第 1 項驗證：搏鬥「按住追蹤」（mobile 390x844）
//   入搏鬥後，用 synthetic PointerEvent 喺精靈螢幕座標按住唔放，
//   每 frame 跟 __cap() 回傳嘅 trackX/trackY 移動指尖，驗證 grip 升到 100 → success。
// 用 ?ls=charge 令首夾必中入搏鬥（順便測 hold 捱得過衝屏撞 cutscene）。
// Run: node scripts/diag-cap-hold.mjs
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
// 直接喺 hold 全屏層派合成 PointerEvent（避開 hit-test）
async function hold(p, x, y, id, type) {
  await p.evaluate(
    ({ x, y, id, type }) => {
      const el = document.querySelector('[data-testid="hold"]');
      if (!el) return;
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          isPrimary: true,
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

// 撳精靈夾 → struggle
for (let i = 0; i < 8; i++) {
  const clamp = page.getByTestId("clamp");
  if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
  const st = await pollUntil(page, (s) => s.phase === "struggle" || s.phase === "failed", 1500);
  if (st?.phase === "struggle") break;
}
await page.waitForTimeout(300);
results.enteredStruggle = (await cap(page))?.phase;
results.holdLayer = await page.getByTestId("hold").count();
results.holdHint = await page.getByTestId("hold-hint").count();
await page.screenshot({ path: "test-shots/hold-struggle-start.png" });

// 按住精靈唔放，每 frame 跟座標移動指尖
let s = await cap(page);
let gripStart = s?.grip;
await hold(page, s.trackX, s.trackY, 1, "pointerdown");
let gripMid = null;
for (let i = 0; i < 400; i++) {
  s = await cap(page);
  if (!s) break;
  if (s.phase === "success" || s.phase === "fled" || s.phase === "failed") break;
  await hold(page, s.trackX, s.trackY, 1, "pointermove");
  if (i === 40) {
    gripMid = s.grip;
    await page.screenshot({ path: "test-shots/hold-gripping.png" });
  }
  await page.waitForTimeout(30);
}
await hold(page, s?.trackX ?? 0, s?.trackY ?? 0, 1, "pointerup");
await page.waitForTimeout(600);
results.gripStart = gripStart;
results.gripMid = gripMid;
results.final = (await cap(page))?.phase;
results.finalGrip = (await cap(page))?.grip;
await page.screenshot({ path: "test-shots/hold-result.png" });

// 對照：唔按住（唔中）grip 應該流失、唔會捕獲
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
const drained = await pollUntil(page, (s) => s.phase === "failed" || s.phase === "fled", 6000);
results.noHoldOutcome = drained?.phase ?? "still-struggle";

console.log(JSON.stringify(results, null, 2));
await context.close();
await browser.close();
