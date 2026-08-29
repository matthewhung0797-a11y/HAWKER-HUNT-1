// 診斷：第一波擴充試點（5 新系列 15 隻）→ 圖鑑 30/30、新精靈詳情頁、2D sprite 降級正常
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
console.log("圖鑑 53/53:", body.includes("53/53") ? "✔" : "✘");
for (const name of ["辣蟹仔", "沙嗲仔", "咖啡仔", "菜頭仔", "囉喏仔", "蠔煎仔", "粿條仔", "咖喱卜仔", "煎餅仔", "煎蕊仔"]) {
  console.log(`列表有 ${name}:`, body.includes(name) ? "✔" : "✘");
}
await page.screenshot({ path: "test-shots/diag-wave1-dex.png", fullPage: true });

// 新三階詳情頁（傳說級蟹王）＋ modelUrl:null 嘅 2D sprite 降級
await page.goto("http://localhost:3000/dex/chilli-crab-king", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const detail = await page.evaluate(() => document.body.innerText);
console.log("蟹王顯示名:", detail.includes("辣椒蟹王") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-wave1-crab-king.png" });

// 新一階詳情（進化材料清單應顯示新道具名）
await page.goto("http://localhost:3000/dex/satay-skewerling", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const d2 = await page.evaluate(() => document.body.innerText);
console.log("沙嗲仔顯示名:", d2.includes("沙嗲仔") ? "✔" : "✘");
console.log("進化材料竹籤:", d2.includes("竹籤") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-wave1-satay.png" });

// 第二批新三階（飛餅神象）＋一階（煎蕊仔）
await page.goto("http://localhost:3000/dex/prata-sky-elephant", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const d3 = await page.evaluate(() => document.body.innerText);
console.log("飛餅神象顯示名:", d3.includes("飛餅神象") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-wave1-prata3.png" });

await page.goto("http://localhost:3000/dex/chendol-jelly", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const d4 = await page.evaluate(() => document.body.innerText);
console.log("煎蕊仔顯示名:", d4.includes("煎蕊仔") ? "✔" : "✘");
console.log("進化材料斑蘭綠蕊:", d4.includes("斑蘭綠蕊") ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-wave1-chendol1.png" });

await browser.close();
console.log("診斷完成");
