// 驗證：圖鑑名冇 ·後綴；自拍 overlay 有接地陰影（螢幕錨定路徑亦可見）。
// Run: node scripts/diag-names-selfie.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
mkdirSync("test-shots", { recursive: true });

const SAVE = {
  state: {
    loggedIn: true,
    onboardingDone: true,
    nickname: "T",
    captureCounts: {
      "laksa-dragon": 3,
      "kaya-dragon": 2,
      "chilli-crab-king": 3,
      "kopi-o-emperor": 1,
      "oily-rice-chick": 1,
    },
    ownedSpirits: [
      { uid: "u1", speciesId: "laksa-dragon", exp: 0, level: 5, shiny: true, caughtAt: 0 },
      { uid: "u2", speciesId: "kaya-dragon", exp: 0, level: 4, shiny: false, caughtAt: 0 },
      { uid: "u3", speciesId: "chilli-crab-king", exp: 0, level: 5, shiny: false, caughtAt: 0 },
      { uid: "u4", speciesId: "kopi-o-emperor", exp: 0, level: 4, shiny: false, caughtAt: 0 },
    ],
    checkins: [],
    items: {},
  },
  version: 0,
};

const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
    permissions: ["camera"],
  });
  await context.addInitScript(([save]) => {
    if (!localStorage.getItem("hawker-hunt-save")) {
      localStorage.setItem("hawker-hunt-save", JSON.stringify(save));
    }
    // headless 冇真陀螺儀：強制拒絕，走螢幕錨定路徑（同樣有腳下影）
    window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {};
    window.DeviceOrientationEvent.requestPermission = async () => "denied";
  }, [SAVE]);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));
  return { context, page };
}

const results = {};

// ── 圖鑑：名冇間隔號後綴 ──
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/dex`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-shots/names-dex.png" });
  results.dex = await page.evaluate(() => {
    const texts = [...document.querySelectorAll("a, span, h1, h2, p")]
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);
    const withDot = texts.filter((t) => /[·‧•・]/.test(t) && !/實時排行/.test(t));
    const targets = ["叻沙龍", "咖央聖龍", "辣椒蟹王", "咖啡烏皇"];
    const found = {};
    for (const n of targets) found[n] = texts.some((t) => t === n || t.includes(n));
    return { withDot, found };
  });
  await context.close();
}

// ── 自拍：成功畫面 → 開自拍 → 影一張（螢幕錨定應有腳下影）──
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/capture?species=oily-rice-chick&mode=3d&ls=charge&debug=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);
  await page.getByTestId("start").click({ timeout: 20000 });
  // 等精靈登場
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => (window.__cap ? window.__cap() : null));
    if (s?.onScreen) break;
    await page.waitForTimeout(300);
  }
  // 夾到 struggle
  for (let i = 0; i < 8; i++) {
    const clamp = page.getByTestId("clamp");
    if (await clamp.count()) await clamp.first().click({ timeout: 3000 }).catch(() => {});
    const st = await page.evaluate(() => window.__cap?.()?.phase);
    if (st === "struggle") break;
    await page.waitForTimeout(400);
  }
  // 狂撳到 success
  for (let i = 0; i < 350; i++) {
    const mash = page.getByTestId("mash");
    if (await mash.count()) await mash.first().dispatchEvent("pointerdown").catch(() => {});
    if (i % 10 === 0) {
      const ph = await page.evaluate(() => window.__cap?.()?.phase);
      if (ph === "success" || ph === "fled" || ph === "failed") break;
    }
    await page.waitForTimeout(18);
  }
  await page.waitForTimeout(800);
  results.phase = await page.evaluate(() => window.__cap?.()?.phase);
  await page.screenshot({ path: "test-shots/names-success.png" });

  const openBtn = page.getByTestId("selfie-open");
  results.selfieOpenBtn = await openBtn.count();
  if (results.selfieOpenBtn) {
    await openBtn.click({ timeout: 5000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: "test-shots/selfie-live.png" });
    results.selfieUp = await page.getByTestId("selfie").count();
    // 影一張睇陰影有冇入相
    const shotBtn = page.getByTestId("selfie-shot");
    if (await shotBtn.count()) {
      await shotBtn.click({ timeout: 5000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: "test-shots/selfie-shot.png" });
      results.selfieSave = await page.getByTestId("selfie-save").count();
    }
  }
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
