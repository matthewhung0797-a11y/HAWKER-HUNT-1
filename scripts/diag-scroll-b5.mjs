// Batch 5: full-site scroll audit — each page must reach its bottom content above the fixed nav.
// Run: node scripts/diag-scroll-b5.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

const now = Date.now();
const owned = [
  "radish-cubie",
  "oily-rice-chick",
  "little-laksa",
  "tutu-sprite",
  "kaya-cub",
  "satay-scout",
].map((speciesId, i) => ({ uid: `u${i}`, speciesId, level: 3 + i, caughtAt: now, centreId: "maxwell" }));
const captureCounts = Object.fromEntries(owned.map((o) => [o.speciesId, 1]));

const SAVE = {
  state: {
    loggedIn: true,
    onboardingDone: true,
    nickname: "Scroll",
    playerLevel: 5,
    exp: 40,
    coins: 500,
    gems: 20,
    ownedSpirits: owned,
    captureCounts,
    checkins: [{ centreId: "maxwell", date: "2026-07-23", timestamp: now }],
    items: { "kaya-crystal": 2 },
  },
  version: 0,
};

async function auditPage(path, label, { listMode = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW", deviceScaleFactor: 2 });
  await context.addInitScript((save) => localStorage.setItem("hawker-hunt-save", JSON.stringify(save)), SAVE);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`  [${label} pageerror]`, e.message.slice(0, 140)));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(listMode ? 4500 : 1800);

  // 揀最能滾動嘅容器（body 或內層 overflow-y-auto）
  const info = await page.evaluate(() => {
    const cands = [document.scrollingElement, ...document.querySelectorAll("*")].filter(Boolean);
    let best = document.scrollingElement;
    let max = 0;
    for (const el of cands) {
      const extra = el.scrollHeight - el.clientHeight;
      if (extra > max && el.clientHeight > 200) {
        max = extra;
        best = el;
      }
    }
    best.scrollTop = best.scrollHeight;
    return { scrollable: max, tag: best.tagName, cls: (best.className || "").toString().slice(0, 60) };
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `test-shots/b5-${label}.png` });
  console.log(`${label}: scrollableExtra=${info.scrollable}px via <${info.tag} class="${info.cls}">`);
  await context.close();
}

await auditPage("/dex", "dex");
await auditPage("/dex/oily-rice-chick", "dex-detail");
await auditPage("/profile", "profile");
await auditPage("/leaderboard", "leaderboard");
await auditPage("/founder", "founder");
await auditPage("/map", "map-list", { listMode: true });

await browser.close();
