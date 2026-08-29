// Verify "last stand": Effect A charge-bump, Effect B dash, rare escape->fled, chase-back->resume.
// Uses ?ls=charge|dash|escape to force outcome, ?mode=3d to lock the 3D scene
// (and makes the first clamp guaranteed to enter struggle). Selectors are data-testid to stay ASCII-safe.
// Run: node scripts/diag-laststand.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
    );
  });
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

async function toStruggle(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByTestId("start").click({ timeout: 15000 });
  const aim = await pollUntil(page, (s) => s.phase === "aiming");
  if (!aim) return null;
  for (let i = 0; i < 6; i++) {
    const clamp = page.getByTestId("clamp");
    if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
    const st = await pollUntil(page, (s) => s.phase === "struggle" || s.phase === "failed", 2500);
    if (st?.phase === "struggle") return st;
  }
  return null;
}

// Mash via dispatchEvent('pointerdown') (button uses onPointerDown, and the shaking
// animation makes .click() flaky due to actionability/stability checks).
async function mashUntil(page, pred, taps = 90, gap = 30) {
  const btn = page.getByTestId("mash");
  for (let i = 0; i < taps; i++) {
    if (i % 3 === 0) {
      const s = await cap(page); // ?????????? evaluate ????
      if (s && pred(s)) return s;
    }
    await btn.first().dispatchEvent("pointerdown").catch(() => {});
    await page.waitForTimeout(gap);
  }
  return await cap(page);
}

const results = {};

// Effect A: charge-bump (common) -> mash until charge triggers, then wait for impact overlay
{
  const { context, page } = await newPage();
  const entered = await toStruggle(page, `${BASE}/capture?species=oily-rice-chick&ls=charge&mode=3d`);
  const trig = await mashUntil(page, (s) => s.lastKind === "charge");
  await page.waitForTimeout(300); // impact fires ~220ms after charge starts
  await page.screenshot({ path: "test-shots/ls-charge.png" });
  const after = await cap(page);
  results.charge = {
    entered: entered?.phase ?? null,
    bumpKey: after?.bumpKey ?? 0,
    grip: after?.grip,
    kind: trig?.lastKind ?? null,
    bubble: trig?.bubble ?? null,
  };
  await context.close();
}

// Effect B + real escape (rare): do not chase back -> fled
{
  const { context, page } = await newPage();
  const entered = await toStruggle(page, `${BASE}/capture?species=silky-chicken-warrior&ls=escape&mode=3d`);
  const opened = await mashUntil(page, (s) => s.lastKind === "dash-escape");
  const chaseOpen = await pollUntil(page, (s) => s.chase !== null, 2000); // dash lands -> escape window
  await page.waitForTimeout(150);
  const banner = await page.evaluate(() => document.querySelector(".chase-pulse")?.textContent?.trim() ?? null);
  await page.screenshot({ path: "test-shots/ls-escape-window.png" });
  const fledState = await pollUntil(page, (s) => s.phase === "fled", 3000);
  await page.screenshot({ path: "test-shots/ls-escape-fled.png" });
  results.escape = {
    entered: entered?.phase ?? null,
    grip: opened?.grip,
    streakKey: opened?.streakKey ?? 0,
    kind: opened?.lastKind ?? null,
    chaseOpened: chaseOpen?.chase ?? null,
    hasBanner: !!banner,
    fled: fledState?.phase === "fled",
  };
  await context.close();
}

// Effect B off-screen gate (Option A): with the big 3D dash the spirit flashes off-screen,
// so the mash button hides and blind taps can't re-grab (must turn back to re-focus first).
{
  const { context, page } = await newPage();
  await toStruggle(page, `${BASE}/capture?species=silky-chicken-warrior&ls=escape&mode=3d`);
  await mashUntil(page, (s) => s.lastKind === "dash-escape");
  const off = await pollUntil(page, (s) => s.onScreen === false, 3000);
  const mashHidden = (await page.getByTestId("mash").count()) === 0;
  const held = await cap(page);
  await page.screenshot({ path: "test-shots/ls-offscreen-gate.png" });
  results.offscreenGate = {
    wentOffscreen: !!off,
    mashHidden,
    chaseHeld: held?.chase !== null || held?.phase === "fled",
  };
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
const pass =
  results.charge.bumpKey > 0 &&
  results.charge.kind === "charge" &&
  !!results.charge.bubble &&
  results.escape.kind === "dash-escape" &&
  results.escape.hasBanner &&
  results.escape.fled &&
  results.offscreenGate.wentOffscreen &&
  results.offscreenGate.mashHidden;
console.log(pass ? "PASS" : "CHECK: something differs from expected");
await browser.close();
