// 驗證技能能量跟威力分檔：咖啡武士應顯示 50／70 而唔係兩個都 50
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SPECIES = "kopi-sock-warrior";
mkdirSync("test-shots", { recursive: true });

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
          { uid: "u1", speciesId: id, level: 6, exp: 0, caughtAt: Date.now(), centreId: "maxwell" },
        ],
      },
      version: 0,
    })
  );
  localStorage.setItem("hh-battle-tut", "1");
}, SPECIES);
const page = await context.newPage();
// 擋雲存檔，避免 anon session pull 洗走 initScript 寫入嘅 ownedSpirits
await page.route("**/*supabase*/**", (route) => route.abort());
await page.route("**/auth/v1/**", (route) => route.abort());

await page.goto(`${BASE}/battle?uid=u1&centre=maxwell`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem("hawker-hunt-save");
  const s = raw ? JSON.parse(raw) : null;
  return {
    has: !!raw,
    spirits: s?.state?.ownedSpirits?.length ?? null,
    ids: (s?.state?.ownedSpirits ?? []).map((x) => x.speciesId),
  };
});
console.log("localStorage:", saved);
// 若雲存檔洗走咗本地，強制寫返再 reload
if (!saved.spirits) {
  await page.evaluate((id) => {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({
        state: {
          loggedIn: true,
          onboardingDone: true,
          nickname: "T",
          ownedSpirits: [
            { uid: "u1", speciesId: id, level: 6, exp: 0, caughtAt: Date.now(), centreId: "maxwell" },
          ],
        },
        version: 0,
      })
    );
  }, SPECIES);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

// 撳兩下普攻儲到 ≥70 能量，兩個技都點得
for (let i = 0; i < 3; i++) {
  const basic = page.locator("[data-basic-attack]:not([disabled])");
  if (await basic.count()) {
    await basic.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1600);
  }
}
await page.waitForTimeout(800);
await page.screenshot({ path: "test-shots/skill-cost.png" });

const costs = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter((b) =>
    /能量\s*\d+/.test(b.textContent ?? "")
  );
  return btns.map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
});
console.log(JSON.stringify({ costs }, null, 2));
await context.close();
await browser.close();
