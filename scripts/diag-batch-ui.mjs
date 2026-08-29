// 驗證今批改動：字體統一、圖鑑全身圖＋×N、地圖徽章 contain、捕捉入場精靈位置。
// 捕捉頁靠 window.__cap() 拎精靈螢幕座標，判斷係唔係真喺畫面中間。
// Run: node scripts/diag-batch-ui.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const VW = 390;
const VH = 844;
mkdirSync("test-shots", { recursive: true });

const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});

const SAVE = {
  state: {
    loggedIn: true,
    onboardingDone: true,
    nickname: "T",
    // 多隻＋重複，睇 ×N 角標同全身圖
    captureCounts: { "oily-rice-chick": 5, "little-laksa": 2, "tutu-sprite": 1, "bkt-warrior": 3 },
    ownedSpirits: [
      { uid: "u1", speciesId: "oily-rice-chick", exp: 0, level: 3, shiny: false, caughtAt: 0 },
    ],
    checkins: [],
    items: {},
  },
  version: 0,
};

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    locale: "zh-TW",
    deviceScaleFactor: 2,
    permissions: ["camera", "geolocation"],
    geolocation: { latitude: 1.2805, longitude: 103.8449 }, // 麥士威附近
  });
  await context.addInitScript(
    ([save]) => {
      if (!localStorage.getItem("hawker-hunt-save")) {
        localStorage.setItem("hawker-hunt-save", JSON.stringify(save));
      }
    },
    [SAVE]
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));
  return { context, page };
}

const results = {};

// ── 圖鑑：全身圖 + ×N 角標 + 字體 ──
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/dex`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-shots/ui-dex.png" });
  results.dex = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")].filter((i) => i.src.includes("/spirits/"));
    const bodyFont = getComputedStyle(document.body).fontFamily;
    return {
      totalSpiritImgs: imgs.length,
      allUseFullBody: imgs.every((i) => i.src.includes("/spirits/full/")),
      objectFits: [...new Set(imgs.map((i) => getComputedStyle(i).objectFit))],
      countBadges: [...document.querySelectorAll("span")]
        .map((s) => s.textContent?.trim())
        .filter((tx) => tx && /^×\d+$/.test(tx)),
      bodyFont,
      fontHasBaloo: /baloo/i.test(bodyFont),
    };
  });
  await context.close();
}

// ── 地圖：據點徽章 marker 用全身圖 + contain ──
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "test-shots/ui-map.png" });
  results.map = await page.evaluate(() => {
    const marks = [...document.querySelectorAll(".maplibregl-marker img")];
    return {
      markerImgs: marks.length,
      fits: [...new Set(marks.map((i) => getComputedStyle(i).objectFit))],
      srcs: [...new Set(marks.map((i) => (i.src.includes("/full/") ? "full" : "icon")))],
      externalLinks: [...document.querySelectorAll('a[target="_blank"]')].length,
    };
  });
  // 開據點卡睇「帶我去」係唔係 button（唔再係外部連結）
  await page.evaluate(() => {
    const b = document.querySelector(".maplibregl-marker button");
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "test-shots/ui-map-sheet.png" });
  results.mapSheet = await page.evaluate(() => {
    const all = [...document.querySelectorAll("a, button")];
    const nav = all.find((el) => /帶我去/.test(el.textContent ?? ""));
    return {
      navFound: !!nav,
      navTag: nav?.tagName ?? null,
      anyBlankLink: [...document.querySelectorAll('a[target="_blank"]')].length,
      googleMapsLink: [...document.querySelectorAll("a")].filter((a) =>
        a.href.includes("google.com/maps")
      ).length,
    };
  });
  await context.close();
}

// ── 捕捉：入場精靈螢幕位置（要喺畫面中間） ──
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/capture?species=oily-rice-chick&mode=3d&debug=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("start").click({ timeout: 20000 });
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => (window.__cap ? window.__cap() : null));
    if (s) samples.push({ t: i * 0.4, ...s });
    if (i === 1) await page.screenshot({ path: "test-shots/ui-capture-enter.png" });
  }
  await page.screenshot({ path: "test-shots/ui-capture-later.png" });
  results.capture = {
    viewport: { w: VW, h: VH, cx: VW / 2, cy: VH / 2 },
    first: samples[0] ?? null,
    samples: samples.map((s) => ({
      t: s.t,
      phase: s.phase,
      anchor: s.anchor,
      track: s.track,
    })),
  };
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
