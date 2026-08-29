// 診斷：Dev「解鎖全部精靈」→ 圖鑑 15/15＋閃光最終形態
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  locale: "zh-TW",
});
// 只喺首次（無存檔）先寫入，之後導航唔好覆蓋遊戲自己寫嘅存檔
await context.addInitScript(() => {
  if (localStorage.getItem("hawker-hunt-save")) return;
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: { nickname: "T", level: 5, exp: 0, coins: 500, gems: 20, factionId: "central", onboardingDone: true, loggedIn: true, devMode: true, ownedSpirits: [{ uid: "a1", speciesId: "little-laksa", level: 3, caughtAt: Date.now(), centreId: "maxwell" }], captureCounts: { "little-laksa": 1 }, items: {}, checkins: [], unlockedSilhouettes: [], favouriteCentres: [], battleWins: 0, counterWins: 0, evolveCount: 0 },
      version: 0,
    })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:3000/profile", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.tap("text=解鎖全部精靈");
await page.waitForTimeout(600);

await page.goto("http://localhost:3000/dex", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const body = await page.evaluate(() => document.body.innerText);
console.log("圖鑑 15/15:", body.includes("15/15") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-unlock-dex.png", fullPage: true });

// 睇最終形態詳情（叻沙龍，閃光）
await page.goto("http://localhost:3000/dex/laksa-dragon", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const detail = await page.evaluate(() => document.body.innerText);
console.log("叻沙龍顯示名（非 ???）:", detail.includes("叻沙龍") ? "✔" : "✘");
console.log("閃光徽章:", detail.includes("閃光") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-unlock-dragon.png" });

await browser.close();
console.log("診斷完成");
