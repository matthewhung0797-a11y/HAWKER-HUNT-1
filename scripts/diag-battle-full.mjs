// 回合制切磋診斷（能量制＋掃屏閃避）：
// 1) 教學 overlay → 普攻儲能 → 能量夠放大招 → 敵方預警時掃屏閃避（驗證 MISS）→ 打到完場
// 2) 音樂單一播放：SPA 跳頁之後最多得一條 track 出聲
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  hasTouch: true,
});
await context.addInitScript(() => {
  window.__audios = [];
  const OrigAudio = window.Audio;
  window.Audio = function (...args) {
    const a = new OrigAudio(...args);
    window.__audios.push(a);
    return a;
  };
  if (!localStorage.getItem("hawker-hunt-save")) {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({
        state: {
          loggedIn: true,
          onboardingDone: true,
          nickname: "T",
          level: 9,
          exp: 0,
          coins: 500,
          gems: 20,
          ownedSpirits: [
            { uid: "t3", speciesId: "hainan-chicken-god", level: 9, caughtAt: Date.now(), centreId: "maxwell" },
          ],
          captureCounts: { "hainan-chicken-god": 1 },
          items: {},
          checkins: [],
          unlockedSilhouettes: [],
          favouriteCentres: [],
        },
        version: 0,
      })
    );
  }
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));

const playingAudios = () =>
  page.evaluate(() =>
    (window.__audios ?? [])
      .filter((a) => !a.paused && a.src)
      .map((a) => ({ src: a.src.split("/").pop(), vol: +a.volume.toFixed(2) }))
  );
const getEnergy = () =>
  page.evaluate(() => Number(document.querySelector("[data-energy]")?.getAttribute("data-energy") ?? -1));
const hasDodgeLayer = () => page.evaluate(() => !!document.querySelector("[data-dodge-layer]"));
const getLog = () =>
  page.evaluate(() => document.querySelector("main span.rounded-full")?.textContent ?? "");

// ── 1：回合制全場 ──
await page.goto("http://localhost:3000/battle", { waitUntil: "networkidle" });
await page.waitForTimeout(2600); // 過開場橫額

// 教學 overlay（首次）
const tutBtn = page.getByText("開始切磋！");
if (await tutBtn.isVisible().catch(() => false)) {
  console.log("tutorial shown ✔");
  await page.screenshot({ path: "test-shots/tb-0-tutorial.png" });
  await tutBtn.click();
  await page.waitForTimeout(400);
} else {
  console.log("tutorial NOT shown (flag pre-set?)");
}

const basicBtn = page.locator("[data-basic-attack]");
const skillBtns = page.locator("main .grid button.card-parchment");

let ults = 0;
let dodgesTried = 0;
let missSeen = false;
let ended = false;
const t0 = Date.now();
let shotUlt = false;

while (Date.now() - t0 < 120000) {
  ended = await page.evaluate(() => !!document.querySelector(".game-title"));
  if (ended) break;

  // 敵方預警窗口 → 掃屏閃避
  if (await hasDodgeLayer()) {
    await page.mouse.move(180, 420);
    await page.mouse.down();
    await page.mouse.move(310, 420, { steps: 4 });
    await page.mouse.up();
    dodgesTried++;
    await page.waitForTimeout(250);
    const log = await getLog();
    if (log.includes("閃避成功")) missSeen = true;
    continue;
  }

  // 我方回合：能量夠放大招（第一個技能係 power 2.0 大招），否則普攻
  const energy = await getEnergy();
  if (energy >= 100 && (await skillBtns.first().isEnabled().catch(() => false))) {
    await skillBtns.first().click();
    ults++;
    if (!shotUlt) {
      shotUlt = true;
      await page.waitForTimeout(600);
      await page.screenshot({ path: "test-shots/tb-2-ult.png" });
    }
    await page.waitForTimeout(500);
    continue;
  }
  if (await basicBtn.isEnabled().catch(() => false)) {
    await basicBtn.click();
    await page.waitForTimeout(400);
    if (!shotUlt && ults === 0 && Date.now() - t0 > 5000) {
      await page.screenshot({ path: "test-shots/tb-1-fight.png" });
    }
    continue;
  }
  await page.waitForTimeout(300);
}

console.log(
  `battle ended: ${ended} | ults: ${ults} | dodges tried: ${dodgesTried} | dodge success seen: ${missSeen}`
);
await page.screenshot({ path: "test-shots/tb-3-end.png" });
const endTitle = await page.evaluate(() => document.querySelector(".game-title")?.textContent ?? "none");
console.log("result:", endTitle);

// 勝利時驗證精靈經驗獎勵＋等級持久化
if (endTitle.includes("勝利")) {
  const expRow = await page.evaluate(() => document.body.textContent?.includes("精靈經驗"));
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("hawker-hunt-save") ?? "{}");
    const sp = s?.state?.ownedSpirits?.[0];
    return sp ? { level: sp.level, exp: sp.exp } : null;
  });
  console.log("spirit EXP row shown:", expRow, "| persisted spirit:", JSON.stringify(saved));
}
console.log("battle music playing:", JSON.stringify(await playingAudios()));

// ── 2：音樂重疊測試——SPA 快速跳頁 ──
await page.goto("http://localhost:3000/battle", { waitUntil: "networkidle" });
await page.mouse.click(200, 400);
await page.waitForTimeout(1500);
await page.getByText("←").first().click().catch(() => {});
await page.waitForTimeout(1000);
await page.goBack({ waitUntil: "commit" });
await page.waitForTimeout(600);
await page.goForward({ waitUntil: "commit" });
await page.waitForTimeout(500);
await page.goBack({ waitUntil: "commit" });
await page.waitForTimeout(3500);
const finalAudios = await playingAudios();
console.log("after hops, playing:", JSON.stringify(finalAudios));
console.log(finalAudios.length <= 1 ? "MUSIC OK: no overlap" : "MUSIC FAIL: overlap!");
await browser.close();
