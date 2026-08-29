// 自動視覺測試：mobile viewport 渲染每頁，記錄 console error，影 screenshot
// 用法: node scripts/visual-test.mjs [baseUrl] [pageFilter]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const FILTER = process.argv[3] ?? "";

// 麥士威熟食中心座標（測試地理圍欄）
const GEO = { latitude: 1.28027, longitude: 103.84449 };

const PAGES = [
  { name: "landing", path: "/" },
  { name: "onboarding", path: "/onboarding" },
  { name: "login", path: "/login" },
  { name: "map", path: "/map", wait: 6000 },
  { name: "dex", path: "/dex" },
  { name: "dex-detail", path: "/dex/laksa-warrior", wait: 3500 },
  { name: "leaderboard", path: "/leaderboard" },
  { name: "profile", path: "/profile" },
  { name: "capture", path: "/capture", wait: 3500 },
  { name: "capture-aiming", path: "/capture", wait: 3000, click: "text=即時開始玩", afterWait: 3500 },
];

mkdirSync("test-shots", { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--enable-unsafe-swiftshader",
  ],
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  geolocation: GEO,
  permissions: ["geolocation", "camera"],
  locale: "zh-TW",
});

// 預先寫入已登入狀態，跳過 landing redirect
await context.addInitScript(() => {
  const save = {
    state: {
      nickname: "TestHunter",
      level: 3,
      exp: 50,
      coins: 1250,
      gems: 20,
      factionId: "central",
      onboardingDone: true,
      loggedIn: true,
      devMode: false,
      ownedSpirits: [
        { uid: "t1", speciesId: "laksa-warrior", level: 2, caughtAt: Date.now(), centreId: "maxwell" },
        { uid: "t2", speciesId: "oily-rice-chick", level: 1, caughtAt: Date.now(), centreId: "maxwell" },
      ],
      captureCounts: { "laksa-warrior": 1, "oily-rice-chick": 2 },
      items: { "shrimp-shell-shard": 6, "chicken-oil-essence": 3 },
      checkins: [],
      unlockedSilhouettes: ["tutu-sprite"],
      favouriteCentres: [],
    },
    version: 0,
  };
  localStorage.setItem("hawker-hunt-save", JSON.stringify(save));
});

let hadError = false;

for (const pg of PAGES) {
  if (FILTER && !pg.name.includes(FILTER)) continue;
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      errors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  page.on("requestfailed", (req) =>
    errors.push(`[requestfailed] ${req.url().slice(0, 120)} ${req.failure()?.errorText ?? ""}`)
  );

  try {
    await page.goto(`${BASE}${pg.path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(pg.wait ?? 1500);
    if (pg.click) {
      await page.click(pg.click, { timeout: 5000 }).catch((e) => errors.push(`[click] ${e.message}`));
      await page.waitForTimeout(pg.afterWait ?? 2000);
    }
    await page.screenshot({ path: `test-shots/${pg.name}.png` });
    const relevant = errors.filter(
      (e) => !e.includes("Download the React DevTools") && !e.includes("[HMR]") && !e.includes("Fast Refresh")
    );
    if (relevant.length > 0) {
      hadError = true;
      console.log(`\n=== ${pg.name} (${pg.path}) — ${relevant.length} issues ===`);
      for (const e of relevant.slice(0, 12)) console.log("  " + e.slice(0, 300));
    } else {
      console.log(`OK  ${pg.name}`);
    }
  } catch (err) {
    hadError = true;
    console.log(`FAIL ${pg.name}: ${err.message.slice(0, 200)}`);
  }
  await page.close();
}

// 未登入 landing（無 save 資料）
if (!FILTER || "landing-out".includes(FILTER)) {
  const freshCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-TW",
  });
  const page = await freshCtx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "test-shots/landing-out.png" });
  console.log("OK  landing-out");
  await freshCtx.close();
}

await browser.close();
console.log(hadError ? "\nDone with issues — check test-shots/" : "\nAll clean — check test-shots/");
