// 三項新功能診斷：
// A) 切磋勝利掉落進化材料（結算行＋localStorage 持久化）
// B) 開場前出戰精靈選擇器（多過一隻先出現；記住上次出戰）
// C) 排行榜：未配置 Supabase 時顯示離線示範數據＋本地玩家行
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  hasTouch: true,
});
await context.addInitScript(() => {
  if (!localStorage.getItem("hawker-hunt-save")) {
    localStorage.setItem("hh-battle-tut", "1"); // 跳過教學
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({
        state: {
          loggedIn: true,
          onboardingDone: true,
          nickname: "T",
          factionId: "central",
          level: 9,
          exp: 0,
          coins: 500,
          gems: 20,
          ownedSpirits: [
            { uid: "u1", speciesId: "laksa-warrior", level: 8, caughtAt: Date.now(), centreId: "maxwell" },
            { uid: "u2", speciesId: "little-laksa", level: 2, caughtAt: Date.now(), centreId: "maxwell" },
          ],
          captureCounts: { "laksa-warrior": 1, "little-laksa": 1 },
          items: {},
          checkins: [],
          unlockedSilhouettes: [],
          favouriteCentres: [],
          lastBattleUid: null,
        },
        version: 0,
      })
    );
  }
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));

// ── B：出戰選擇器 ──
await page.goto("http://localhost:3000/battle", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const pickerTitle = await page.getByText("揀邊個出戰").isVisible().catch(() => false);
const cardCount = await page.locator("main .grid button.card-parchment").count();
console.log(`picker shown: ${pickerTitle} | cards: ${cardCount}`);
await page.screenshot({ path: "test-shots/abc-1-picker.png" });

// 揀 laksa-warrior（高等，快啲打完）
await page.locator("main .grid button.card-parchment").first().click();
await page.waitForTimeout(2600); // 開場橫額

const savedLastUid = await page.evaluate(
  () => JSON.parse(localStorage.getItem("hawker-hunt-save") ?? "{}")?.state?.lastBattleUid
);
console.log("lastBattleUid persisted:", savedLastUid);

// ── A：打到贏，驗證掉落 ──
const getEnergy = () =>
  page.evaluate(() => Number(document.querySelector("[data-energy]")?.getAttribute("data-energy") ?? -1));
const hasDodgeLayer = () => page.evaluate(() => !!document.querySelector("[data-dodge-layer]"));
const basicBtn = page.locator("[data-basic-attack]");
const skillBtns = page.locator("main .grid button.card-parchment");

let ended = false;
const t0 = Date.now();
while (Date.now() - t0 < 150000) {
  ended = await page.evaluate(() => !!document.querySelector(".game-title"));
  if (ended) break;
  if (await hasDodgeLayer()) {
    await page.mouse.move(180, 420);
    await page.mouse.down();
    await page.mouse.move(310, 420, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    continue;
  }
  const energy = await getEnergy();
  if (energy >= 100 && (await skillBtns.first().isEnabled().catch(() => false))) {
    await skillBtns.first().click();
    await page.waitForTimeout(500);
    continue;
  }
  if (await basicBtn.isEnabled().catch(() => false)) {
    await basicBtn.click();
    await page.waitForTimeout(400);
    continue;
  }
  await page.waitForTimeout(300);
}

const endTitle = await page.evaluate(() => document.querySelector(".game-title")?.textContent ?? "none");
console.log("battle result:", endTitle);
await page.screenshot({ path: "test-shots/abc-2-victory.png" });

if (endTitle.includes("勝利")) {
  const lootShown = await page.evaluate(() => document.body.textContent?.includes("進化材料"));
  const items = await page.evaluate(
    () => JSON.parse(localStorage.getItem("hawker-hunt-save") ?? "{}")?.state?.items ?? {}
  );
  console.log("loot row shown:", lootShown, "| persisted items:", JSON.stringify(items));
} else {
  console.log("NOT victory — loot check skipped (rerun if defeated)");
}

// ── C：排行榜離線退回 ──
await page.goto("http://localhost:3000/leaderboard", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const offlineBadge = await page.getByText("離線示範數據").isVisible().catch(() => false);
console.log("leaderboard offline badge:", offlineBadge);
await page.getByText("個人排行").click();
await page.waitForTimeout(400);
const meRow = await page.evaluate(() => document.body.textContent?.includes("· 你"));
console.log("personal tab shows me:", meRow);
await page.screenshot({ path: "test-shots/abc-3-leaderboard.png" });

await browser.close();
