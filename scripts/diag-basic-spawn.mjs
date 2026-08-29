// 診斷：原材料層（rarity: basic）出現率——有據點／無據點各抽 6000 次統計分佈
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
// spawn.ts 只由 capture page 引入，dev hook 要去 /capture 先掛上
await page.goto("http://localhost:3000/capture", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const stats = await page.evaluate(() => {
  const pick = window.__pickWildSpecies;
  const map = window.__SPECIES_MAP;
  if (!pick || !map) return null;
  const run = (centreId) => {
    const byRarity = {};
    const basicCount = {};
    for (let i = 0; i < 6000; i++) {
      const sp = map[pick(centreId)];
      byRarity[sp.rarity] = (byRarity[sp.rarity] ?? 0) + 1;
      if (sp.rarity === "basic") basicCount[sp.id] = (basicCount[sp.id] ?? 0) + 1;
    }
    return { byRarity, basicKinds: Object.keys(basicCount).length };
  };
  return { maxwell: run("maxwell"), noCentre: run(null) };
});

if (!stats) {
  console.log("✘ window.__pickWildSpecies 唔存在（dev hook 未掛上）");
} else {
  for (const [label, s] of Object.entries(stats)) {
    const total = Object.values(s.byRarity).reduce((a, b) => a + b, 0);
    const pct = (n) => `${(((n ?? 0) / total) * 100).toFixed(1)}%`;
    console.log(
      `${label}: basic ${pct(s.byRarity.basic)}｜common ${pct(s.byRarity.common)}｜rare ${pct(s.byRarity.rare)}｜basic 種類 ${s.basicKinds}/8`
    );
    console.log(`  basic 佔最大層: ${(s.byRarity.basic ?? 0) > (s.byRarity.common ?? 0) ? "✔" : "✘"}`);
  }
}
await browser.close();
