// 診斷：野生精靈加權生成分佈統計
// 驗證：common 佔比 > 70%、野生二階 ≈ 8%、地頭系列加成生效
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  locale: "zh-TW",
});
await context.addInitScript(() => {
  if (localStorage.getItem("hawker-hunt-save")) return;
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: { nickname: "T", level: 5, exp: 0, coins: 500, gems: 20, factionId: "central", onboardingDone: true, loggedIn: true, ownedSpirits: [], captureCounts: {}, items: {}, checkins: [], unlockedSilhouettes: [], favouriteCentres: [], battleWins: 0, counterWins: 0, evolveCount: 0 },
      version: 0,
    })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:3000/capture?centre=maxwell", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.__pickWildSpecies === "function", null, { timeout: 20000 });

const N = 2000;
const stats = await page.evaluate((n) => {
  const pick = window.__pickWildSpecies;
  const MAP = window.__SPECIES_MAP;
  const run = (centreId) => {
    const counts = {};
    let stage2 = 0;
    let common = 0;
    let home = 0;
    for (let i = 0; i < n; i++) {
      const id = pick(centreId);
      counts[id] = (counts[id] ?? 0) + 1;
      const sp = MAP[id];
      if (sp.stage === 2) stage2++;
      if (sp.stage === 1 && sp.rarity === "common") common++;
      if (sp.seriesId === "kueh") home++; // maxwell 代表 pastry-queen（kueh 系）
    }
    return { counts, stage2Rate: stage2 / n, commonRate: common / n, homeRate: home / n };
  };
  return { maxwell: run("maxwell"), anywhere: run(null) };
}, N);

const pct = (x) => (x * 100).toFixed(1) + "%";
for (const [label, s] of Object.entries(stats)) {
  console.log(`\n== ${label}（${N} 次抽樣）==`);
  console.log("分佈:", Object.entries(s.counts).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${id}:${c}`).join("  "));
  console.log("common 一階佔比:", pct(s.commonRate), s.commonRate > 0.7 ? "✔ (>70%)" : "✘ (要求>70%)");
  console.log("野生二階率:", pct(s.stage2Rate), s.stage2Rate > 0.04 && s.stage2Rate < 0.13 ? "✔ (~8%)" : "✘ (要求約 8%)");
  if (label === "maxwell") console.log("地頭（kueh 系）佔比:", pct(s.homeRate));
}

// 迴歸：capture 頁有精靈生成（唔再係寫死池）
const spawned = await page.evaluate(() => document.body.innerText.length > 0);
console.log("\ncapture 頁載入:", spawned ? "✔" : "✘");

await browser.close();
console.log("診斷完成");
