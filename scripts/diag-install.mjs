import { chromium } from "playwright";

// 用 iPhone UA 載入，驗證安裝橫額 + iOS「加入主畫面」引導 sheet
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  geolocation: { latitude: 1.28027, longitude: 103.84449 },
  permissions: ["geolocation"],
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

await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
await page.waitForTimeout(3000); // 等 1.8s 後橫額出現

const hasBanner = await page.locator("text=裝落主畫面，玩得更爽").count();
console.log("[banner] visible =", hasBanner > 0);
await page.screenshot({ path: "test-shots/install-banner.png" });

// 㩒「安裝」→ iOS 引導 sheet
await page.click("text=安裝").catch((e) => console.log("click fail", e.message));
await page.waitForTimeout(600);
const hasSheet = await page.locator("text=加入主畫面").count();
console.log("[ios-sheet] visible =", hasSheet > 0);
await page.screenshot({ path: "test-shots/install-ios-sheet.png" });

await browser.close();
