// Batch 2 battle-page verification (mobile 390x844):
//   2A tiered dodge (clean fast-swipe = Miss; no swipe = hit),
//   2B layout screenshots (HP cards / log / action bar).
// Pass a label arg to tag screenshots: node scripts/diag-battle-b2.mjs after
import { chromium } from "playwright";

const LABEL = process.argv[2] || "after";
const BASE = "http://localhost:3001";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

const SAVE = {
  state: {
    loggedIn: true,
    onboardingDone: true,
    nickname: "T",
    ownedSpirits: [{ uid: "p1", speciesId: "oily-rice-chick", level: 3, exp: 0 }],
    lastBattleUid: "p1",
  },
  version: 0,
};

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
  });
  await context.addInitScript((save) => {
    localStorage.setItem("hawker-hunt-save", JSON.stringify(save));
    localStorage.setItem("hh-battle-tut", "1"); // 收起首次教學
  }, SAVE);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));
  return { context, page };
}

const popupText = (page) =>
  page.evaluate(() => document.querySelector(".dmg-pop")?.textContent?.trim() ?? null);

// 掃屏：喺 dodge 層 dispatch 真 PointerEvent（React 根監聽會收到），delayMs 控制相對預警出現嘅時機
async function swipe(page, delayMs = 0) {
  if (delayMs) await page.waitForTimeout(delayMs);
  return page.evaluate(() => {
    const el = document.querySelector("[data-dodge-layer]");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const x0 = r.left + r.width / 2;
    const mk = (type, x) =>
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y });
    el.dispatchEvent(mk("pointerdown", x0));
    el.dispatchEvent(mk("pointermove", x0 + 24));
    el.dispatchEvent(mk("pointermove", x0 + 60));
    el.dispatchEvent(mk("pointermove", x0 + 96));
    el.dispatchEvent(mk("pointerup", x0 + 96));
    return true;
  });
}

async function toPlayerTurn(page) {
  await page.goto(`${BASE}/battle?uid=p1&centre=old-airport`, { waitUntil: "domcontentloaded" });
  // 等底部操作區（普攻掣）出現＝已過開場橫額入回合
  await page.locator("[data-basic-attack]").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
}

const results = {};

// ── Player turn layout ──
{
  const { context, page } = await newPage();
  await toPlayerTurn(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-shots/b2-${LABEL}-player.png` });
  results.actionButtons = await page.evaluate(
    () => document.querySelectorAll(".card-parchment button, button.card-parchment").length
  );
  await context.close();
}

// ── Clean dodge (fast swipe within 0.5s of warn) => Miss ──
{
  const { context, page } = await newPage();
  await toPlayerTurn(page);
  await page.locator("[data-basic-attack]").click({ timeout: 8000 }).catch(() => {});
  const layer = page.locator("[data-dodge-layer]");
  await layer.waitFor({ state: "attached", timeout: 8000 }).catch(() => {});
  results.cleanSwiped = await swipe(page, 0); // 預警一出即掃（<0.5s）＝ clean 全避
  await page.screenshot({ path: `test-shots/b2-${LABEL}-warn.png` });
  await page.waitForTimeout(1100);
  results.cleanDodgePopup = await popupText(page);
  await context.close();
}

// ── No dodge (ignore warn) => hit (-dmg) ──
{
  const { context, page } = await newPage();
  await toPlayerTurn(page);
  await page.locator("[data-basic-attack]").click({ timeout: 8000 }).catch(() => {});
  await page.locator("[data-dodge-layer]").waitFor({ state: "attached", timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200); // 唔掃，等窗口過
  results.noDodgePopup = await popupText(page);
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
