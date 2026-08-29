import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["camera"],
  locale: "zh-TW",
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));

await page.goto("http://localhost:3000/capture?species=little-laksa", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.click("text=即時開始玩").catch((e) => console.log("click fail", e.message));
await page.waitForTimeout(1500);

// 用瞄準圈位置追蹤精靈屏幕座標（瞄準圈跟住精靈走）
async function ringPos() {
  return page.evaluate(() => {
    const ring = document.querySelector('[data-ring="target"]');
    if (!ring) return null;
    const r = ring.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
}

for (let i = 0; i < 4; i++) {
  console.log(`t=${i * 2.5}s ring at:`, JSON.stringify(await ringPos()));
  await page.screenshot({ path: `test-shots/wander-${i}.png` });
  await page.waitForTimeout(2500);
}
await browser.close();
