// 捕捉成功畫面精靈尺寸驗證
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
mkdirSync("test-shots", { recursive: true });

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  deviceScaleFactor: 2,
});
await context.addInitScript(() => {
  if (!localStorage.getItem("hawker-hunt-save")) {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
    );
  }
});
const page = await context.newPage();

// 煎蕊仔 = 用戶截圖嗰隻矮肥寵（最易「太大」）
await page.goto(`${BASE}/capture?species=chendol-jelly&mode=3d&debug=1`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2000);
for (let i = 0; i < 20; i++) {
  const ok = await page.evaluate(() => typeof window.__cap?.showSuccess === "function");
  if (ok) break;
  await page.waitForTimeout(200);
}
await page.evaluate(() => window.__cap.showSuccess());
await page.waitForTimeout(2500);
await page.screenshot({ path: "test-shots/success-size.png" });

const box = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll("canvas")];
  const c = canvases.find((el) => el.clientHeight > 100 && el.clientHeight < 400);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
});
console.log(JSON.stringify({ showcase: box }, null, 2));
await context.close();
await browser.close();
