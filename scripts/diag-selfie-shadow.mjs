// 自拍接地陰影驗證：debug hook 直入 selfie overlay。
// Run: node scripts/diag-selfie-shadow.mjs
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
  if (!localStorage.getItem("hawker-hunt-save")) {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({
        state: { loggedIn: true, onboardingDone: true, nickname: "T" },
        version: 0,
      })
    );
  }
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));

await page.goto(`${BASE}/capture?species=oily-rice-chick&mode=3d&debug=1`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2000);

// 等 __cap hook 掛上
for (let i = 0; i < 20; i++) {
  const ok = await page.evaluate(() => typeof window.__cap?.openSelfie === "function");
  if (ok) break;
  await page.waitForTimeout(200);
}

await page.evaluate(async () => {
  await window.__cap.openSelfie(false); // 螢幕錨定路徑（同樣有腳下影）
});
await page.waitForTimeout(2200);
await page.screenshot({ path: "test-shots/selfie-live.png" });

const selfieUp = await page.getByTestId("selfie").count();
console.log("selfie up:", selfieUp);

const shot = page.getByTestId("selfie-shot");
if (await shot.count()) {
  await shot.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-shots/selfie-shot.png" });
  console.log("save btn:", await page.getByTestId("selfie-save").count());
}

await context.close();
await browser.close();
