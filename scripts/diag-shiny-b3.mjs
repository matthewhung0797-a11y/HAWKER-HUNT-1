// Batch 3: shiny keeps sparkle aura + faint gold glow but NO hue/colour shift.
// Verify the 3D model (capture success) and the dex page render the spirit in its true colours.
// Run: node scripts/diag-shiny-b3.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

const SAVE = {
  state: {
    loggedIn: true,
    onboardingDone: true,
    nickname: "T",
    ownedSpirits: [{ uid: "s1", speciesId: "oily-rice-chick", level: 3, exp: 0, shiny: true }],
    captureCounts: { "oily-rice-chick": 1 },
  },
  version: 0,
};

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
    permissions: ["camera"],
  });
  await context.addInitScript((save) => {
    localStorage.setItem("hawker-hunt-save", JSON.stringify(save));
  }, SAVE);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));
  return { context, page };
}

const cap = (page) => page.evaluate(() => (window.__cap ? window.__cap() : null));
async function pollUntil(page, pred, ms = 8000, step = 120) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await cap(page);
    if (s && pred(s)) return s;
    await page.waitForTimeout(step);
  }
  return null;
}

// ── Capture success (shiny) -> 3D model in true colour + sparkles ──
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/capture?species=oily-rice-chick&shiny=1&ls=charge&mode=3d&debug=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("start").click({ timeout: 15000 });
  await pollUntil(page, (s) => s.phase === "aiming");
  await pollUntil(page, (s) => s.onScreen === true, 6000);
  for (let i = 0; i < 6; i++) {
    const clamp = page.getByTestId("clamp");
    if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
    const st = await pollUntil(page, (s) => s.phase === "struggle" || s.phase === "failed", 2000);
    if (st?.phase === "struggle") break;
  }
  const mash = page.getByTestId("mash");
  for (let i = 0; i < 300; i++) {
    if (i % 6 === 0) {
      const s = await cap(page);
      if (s?.phase === "success" || s?.phase === "fled" || s?.phase === "failed") break;
    }
    if (await mash.count()) await mash.first().dispatchEvent("pointerdown").catch(() => {});
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-shots/b3-shiny-success.png" });
  await context.close();
}

// ── Dex page (shiny owned) ──
{
  const { context, page } = await newPage();
  await page.goto(`${BASE}/dex/oily-rice-chick`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: "test-shots/b3-shiny-dex.png" });
  await context.close();
}

console.log("done");
await browser.close();
