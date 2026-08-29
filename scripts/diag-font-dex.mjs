// 截圖圖鑑核對「卜／史詩級」係咪同粉圓體一致
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
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: {
        loggedIn: true,
        onboardingDone: true,
        nickname: "T",
        captureCounts: {
          "wok-hei-god": 1,
          "golden-puff-sovereign": 1,
          "curry-puff-warrior": 1,
          "kopi-o-emperor": 1,
        },
      },
      version: 0,
    })
  );
});
const page = await context.newPage();
await page.route("**/*supabase*/**", (route) => route.abort());
await page.goto(`${BASE}/dex`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.evaluate(async () => {
  await document.fonts.ready;
});
// 篩已捕獲，令「咖喱卜／鑊氣神」入鏡
const caught = page.getByRole("button", { name: "已捕獲" });
if (await caught.count()) await caught.first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "test-shots/font-dex.png" });

const report = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("a")].filter((a) =>
    /鑊氣神|咖喱卜|咖啡/.test(a.textContent ?? "")
  );
  return cards.slice(0, 6).map((a) => {
    const name = a.querySelector("span.text-center, span.font-bold");
    const rarity = [...a.querySelectorAll("span")].find((s) => /史詩|稀有|傳說|常見/.test(s.textContent ?? ""));
    const pick = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { text: el.textContent?.trim(), font: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize };
    };
    return { name: pick(name), rarity: pick(rarity) };
  });
});
console.log(JSON.stringify(report, null, 2));
await context.close();
await browser.close();
