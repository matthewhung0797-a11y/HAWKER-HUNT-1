// 打鬥場面端到端診斷：塞一隻叻沙武士入存檔 → 開 /battle → 出招 → 截圖
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  hasTouch: true,
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: {
        loggedIn: true,
        onboardingDone: true,
        nickname: "T",
        level: 5,
        exp: 0,
        coins: 500,
        gems: 20,
        ownedSpirits: [
          { uid: "test1", speciesId: "laksa-warrior", level: 7, caughtAt: Date.now(), centreId: "maxwell" },
        ],
        captureCounts: { "laksa-warrior": 1 },
        items: {},
        checkins: [],
        unlockedSilhouettes: [],
        favouriteCentres: [],
      },
      version: 0,
    })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" || t.startsWith("GLBSCALE")) console.log(`[${m.type()}]`, t.slice(0, 250));
});
page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(-70), r.failure()?.errorText));

await page.goto("http://localhost:3000/battle", { waitUntil: "networkidle" });
await page.waitForTimeout(2600); // 過開場橫額
// 首次教學彈窗：撳「開始切磋」關閉
const tutBtn = page.locator("button.btn-gold").first();
if (await tutBtn.isVisible().catch(() => false)) {
  await tutBtn.click();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: "test-shots/battle-1-field.png" });

// 檢查 canvas 有冇著色（非全黑）
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return { canvas: false };
  return { canvas: true, w: c.width, h: c.height };
});
console.log("canvas:", JSON.stringify(canvasInfo));

// 撳第一個技能掣
const skillBtn = page.locator("main button.card-parchment").first();
await skillBtn.click();
await page.waitForTimeout(500);
await page.screenshot({ path: "test-shots/battle-2-attack.png" });
await page.waitForTimeout(900);
await page.screenshot({ path: "test-shots/battle-3-enemyturn.png" });
await page.waitForTimeout(2200);
await page.screenshot({ path: "test-shots/battle-4-after.png" });

// 連環出招直到完場（最多 12 回合）
for (let i = 0; i < 12; i++) {
  const ended = await page.evaluate(() => !!document.querySelector(".game-title"));
  if (ended) break;
  const enabled = await skillBtn.isEnabled().catch(() => false);
  if (enabled) {
    await skillBtn.click();
    await page.waitForTimeout(3400);
  } else {
    await page.waitForTimeout(800);
  }
}
await page.screenshot({ path: "test-shots/battle-5-end.png" });
console.log("done");
await browser.close();
