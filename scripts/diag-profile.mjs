// 診斷：個人頁改版——精靈卡片、徽章牆、徽章詳情彈窗
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "zh-TW",
});
await context.addInitScript(() => {
  const now = Date.now();
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: {
        nickname: "測試獵人",
        level: 5,
        exp: 40,
        coins: 800,
        gems: 20,
        factionId: "central",
        onboardingDone: true,
        loggedIn: true,
        devMode: false,
        ownedSpirits: [
          { uid: "a1", speciesId: "laksa-warrior", level: 7, caughtAt: now, centreId: "maxwell" },
          { uid: "a2", speciesId: "little-laksa", level: 3, caughtAt: now, centreId: "maxwell", shiny: true },
          { uid: "a3", speciesId: "bkt-cub", level: 5, caughtAt: now, centreId: "chinatown-complex" },
          { uid: "a4", speciesId: "kaya-blob", level: 2, caughtAt: now, centreId: "tekka-centre" },
          { uid: "a5", speciesId: "tutu-sprite", level: 4, caughtAt: now, centreId: "old-airport-road" },
        ],
        captureCounts: { "laksa-warrior": 2, "little-laksa": 3, "bkt-cub": 1, "kaya-blob": 1, "tutu-sprite": 1 },
        items: { "item-garlic": 2 },
        checkins: [
          { centreId: "maxwell", date: "2026-07-07", timestamp: now },
          { centreId: "maxwell", date: "2026-07-06", timestamp: now },
          { centreId: "tekka-centre", date: "2026-07-07", timestamp: now },
        ],
        unlockedSilhouettes: [],
        favouriteCentres: [],
        battleWins: 6,
        counterWins: 3,
        evolveCount: 1,
      },
      version: 0,
    })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "test-shots/diag-profile-1.png", fullPage: true });

// 撳「五味相剋宗師」徽章 → 詳情彈窗（進度 3/10）
await page.tap("text=五味相剋宗師");
await page.waitForTimeout(600);
const modalText = await page.evaluate(() => document.body.innerText);
console.log("彈窗顯示進度 3/10:", modalText.includes("3/10") ? "✔" : "✘");
console.log("彈窗顯示描述:", modalText.includes("金剋木") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-profile-2-badge-modal.png" });

// 撳已解鎖徽章（擂台新丁 6/5）
await page.tap("text=關閉");
await page.waitForTimeout(400);
await page.tap("text=擂台新丁");
await page.waitForTimeout(500);
const modal2 = await page.evaluate(() => document.body.innerText);
console.log("擂台新丁已解鎖:", modal2.includes("已解鎖") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-profile-3-unlocked.png" });

await browser.close();
console.log("診斷完成");
