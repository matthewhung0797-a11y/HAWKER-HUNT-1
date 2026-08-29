// 驗證自拍「再影」唔會黑屏：video 保持 mount＋srcObject 仍在
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
mkdirSync("test-shots", { recursive: true });

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
    JSON.stringify({
      state: { loggedIn: true, onboardingDone: true, nickname: "T" },
      version: 0,
    })
  );
  window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {};
  window.DeviceOrientationEvent.requestPermission = async () => "denied";
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));

await page.goto(`${BASE}/capture?species=chendol-jelly&mode=3d&debug=1`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2000);
for (let i = 0; i < 20; i++) {
  const ok = await page.evaluate(() => typeof window.__cap?.openSelfie === "function");
  if (ok) break;
  await page.waitForTimeout(200);
}
await page.evaluate(() => window.__cap.openSelfie(false));
await page.waitForTimeout(1800);

const before = await page.evaluate(() => {
  const v = document.querySelector('[data-testid="selfie"] video');
  return {
    hasVideo: !!v,
    hasStream: !!(v && v.srcObject),
    tracks: v?.srcObject ? v.srcObject.getTracks().length : 0,
    paused: v?.paused ?? null,
  };
});
await page.screenshot({ path: "test-shots/selfie-retake-live.png" });

await page.getByTestId("selfie-shot").click();
await page.waitForTimeout(700);
await page.screenshot({ path: "test-shots/selfie-retake-shot.png" });

await page.getByText("再影").click();
await page.waitForTimeout(900);
await page.screenshot({ path: "test-shots/selfie-retake-again.png" });

const after = await page.evaluate(() => {
  const v = document.querySelector('[data-testid="selfie"] video');
  const cs = v ? getComputedStyle(v) : null;
  return {
    hasVideo: !!v,
    hasStream: !!(v && v.srcObject),
    tracks: v?.srcObject ? v.srcObject.getTracks().length : 0,
    paused: v?.paused ?? null,
    visibility: cs?.visibility,
    // 唔應該係 display:none（我哋用 invisible＝visibility:hidden）
    display: cs?.display,
  };
});

console.log(JSON.stringify({ before, after, ok: after.hasVideo && after.hasStream && after.tracks > 0 }, null, 2));
await context.close();
await browser.close();
