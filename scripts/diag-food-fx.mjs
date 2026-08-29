// 影低美食粒子特效：黃金飯暴（米粒彈幕）＋辣椒醬炮（辣椒投射物）
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
await context.addInitScript(() => {
  localStorage.setItem("hh-battle-tut", "1");
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: {
        loggedIn: true, onboardingDone: true, nickname: "T", level: 9, exp: 0,
        coins: 500, gems: 20,
        ownedSpirits: [{ uid: "t3", speciesId: "hainan-chicken-god", level: 9, caughtAt: Date.now(), centreId: "maxwell" }],
        captureCounts: { "hainan-chicken-god": 1 }, items: {}, checkins: [],
        unlockedSilhouettes: [], favouriteCentres: [],
      },
      version: 0,
    })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));

await page.goto("http://localhost:3000/battle", { waitUntil: "networkidle" });
await page.waitForTimeout(3200);

const basicBtn = page.locator("[data-basic-attack]");
const skillBtns = page.locator("main .grid button.card-parchment");
const getEnergy = () =>
  page.evaluate(() => Number(document.querySelector("[data-energy]")?.getAttribute("data-energy") ?? -1));
const isEnded = () => page.evaluate(() => !!document.querySelector(".game-title"));

/** 等到指定掣可撳（我方回合＋能量夠）先撳落去 */
async function clickWhenReady(loc, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await isEnded()) return false;
    if (await loc.isEnabled().catch(() => false)) {
      await loc.click();
      return true;
    }
    await page.waitForTimeout(200);
  }
  return false;
}

// 儲到 50 能量 → 辣椒醬炮（第二個技能）
while ((await getEnergy()) < 50 && !(await isEnded())) {
  await clickWhenReady(basicBtn);
  await page.waitForTimeout(600);
}
if (await clickWhenReady(skillBtns.nth(1))) {
  await page.waitForTimeout(320); // 投射物飛行中
  await page.screenshot({ path: "test-shots/fx-chilli.png" });
  console.log("chilli shot ✔");
}

// 儲到 100 → 黃金飯暴（米粒彈幕）
while ((await getEnergy()) < 100 && !(await isEnded())) {
  await clickWhenReady(basicBtn);
  await page.waitForTimeout(600);
}
if (await clickWhenReady(skillBtns.nth(0))) {
  // 連拍 8 張（每 170ms）：實測邊一刻米粒彈幕最清楚
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(170);
    await page.screenshot({ path: `test-shots/fx-rice-${i}.png` });
  }
  console.log("rice storm burst ✔");
}
console.log("done, ended:", await isEnded());
await browser.close();
