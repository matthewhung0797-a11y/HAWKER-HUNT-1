// 第 4 項驗證：shiny 模型 100% 原色（劏走金 emissive），只靠閃粉＋✦ 徽章。
//   預填一隻 shiny oily-rice-chick 存檔，開 dex/[id] 截圖肉眼睇。
// Run: node scripts/diag-cap-shiny.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const ID = "oily-rice-chick";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  deviceScaleFactor: 2,
});
await context.addInitScript((id) => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: {
        loggedIn: true,
        onboardingDone: true,
        nickname: "T",
        ownedSpirits: [
          {
            uid: "shiny-1",
            speciesId: id,
            level: 5,
            caughtAt: Date.now(),
            centreId: "chinatown-complex",
            shiny: true,
          },
        ],
        captureCounts: { [id]: 1 },
      },
      version: 0,
    })
  );
}, ID);
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

await page.goto(`${BASE}/dex/${ID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500); // 等 GLB 載入＋render

const results = {
  shinyBadge: await page.getByText("閃光精靈").count(),
};
await page.screenshot({ path: "test-shots/shiny-dex.png" });
console.log(JSON.stringify(results, null, 2));
await context.close();
await browser.close();
