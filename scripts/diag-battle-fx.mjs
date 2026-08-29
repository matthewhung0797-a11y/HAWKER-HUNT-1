// 招式演出診斷：普攻武器演出＋大招 signature 逐招截圖
// 用法：node scripts/diag-battle-fx.mjs [speciesId ...]（唔俾參數 = 測 4 隻代表）
import { chromium } from "playwright";

// 各大招持有者（stage 3）；普攻 motion 睇 BASIC_FX
const ALL = [
  "hainan-chicken-god", // shoot ＋ golden-rice-storm
  "laksa-dragon", // slash ＋ spice-inferno
  "bkt-grandmaster", // smash ＋ garlic-meteor
  "pastry-queen", // slash ＋ gula-melaka-burst
  "kaya-dragon", // smash ＋ phantom-flame
  "chilli-crab-king", // stab ＋ chilli-tsunami
  "satay-flame-emperor", // stab ＋ hundred-skewer-storm
  "kopi-o-emperor", // smash ＋ black-gold-waterfall
  "black-white-cake-king", // slash ＋ black-white-duet
  "rojak-king", // stab ＋ hundred-flavour-vortex
  "oyster-immortal", // smash ＋ tidal-omelette
  "wok-hei-god", // slash ＋ wok-hei-blast
  "golden-puff-sovereign", // slash ＋ thousand-layer-blades
  "prata-sky-elephant", // shoot ＋ sky-prata-cyclone
  "chendol-snow-queen", // slash ＋ emerald-blizzard
];
const DEFAULT_PICK = ["hainan-chicken-god", "laksa-dragon", "bkt-grandmaster", "satay-flame-emperor"];
const targets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PICK;

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

for (const speciesId of targets) {
  if (!ALL.includes(speciesId)) console.log(`（提示：${speciesId} 唔喺大招名單，仍照測普攻）`);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-TW",
    hasTouch: true,
  });
  await context.addInitScript((sid) => {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({
        state: {
          loggedIn: true,
          onboardingDone: true,
          nickname: "T",
          level: 30,
          exp: 0,
          coins: 500,
          gems: 20,
          ownedSpirits: [{ uid: "test1", speciesId: sid, level: 30, caughtAt: Date.now(), centreId: "maxwell" }],
          captureCounts: { [sid]: 1 },
          items: {},
          checkins: [],
          unlockedSilhouettes: [],
          favouriteCentres: [],
        },
        version: 0,
      })
    );
    localStorage.setItem("hh-battle-tut", "1"); // 跳過教學彈窗
  }, speciesId);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 250)));

  await page.goto("http://localhost:3000/battle?uid=test1", { waitUntil: "networkidle" });
  await page.waitForTimeout(3200); // 開場橫額＋模型載入

  const basicBtn = page.locator("[data-basic-attack]");
  const ended = () => page.evaluate(() => !!document.querySelector(".game-title"));
  const waitTurn = async () => {
    for (let i = 0; i < 40; i++) {
      if (await ended()) return false;
      if (await basicBtn.isEnabled().catch(() => false)) return true;
      await page.waitForTimeout(400);
    }
    return false;
  };

  // ── 普攻 ×3（順便儲夠 105 能量）；第一下影演出＋命中兩格 ──
  let alive = await waitTurn();
  for (let i = 0; i < 3 && alive; i++) {
    await basicBtn.click();
    if (i === 0) {
      await page.waitForTimeout(280);
      await page.screenshot({ path: `test-shots/fx-${speciesId}-basic-motion.png` });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `test-shots/fx-${speciesId}-basic-impact.png` });
    }
    alive = await waitTurn();
  }
  if (!alive) {
    console.log(`${speciesId}: 未夠能量已完場（普攻截圖照有）`);
    await context.close();
    continue;
  }

  // ── 大招：搵 power ≥ 1.8 嘅技能掣（按鈕文字有 ×2 / ×1.8…）──
  const grid = page.locator("main .grid button");
  const n = await grid.count();
  let clicked = false;
  for (let i = 0; i < n; i++) {
    const txt = (await grid.nth(i).innerText().catch(() => "")) ?? "";
    if (/×(1\.[89]|2(\.\d)?)\b/.test(txt) && (await grid.nth(i).isEnabled().catch(() => false))) {
      await grid.nth(i).click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    console.log(`${speciesId}: 搵唔到可用大招掣`);
    await context.close();
    continue;
  }
  // 蓄力（850ms）→ signature 主體 → 命中
  await page.waitForTimeout(450);
  await page.screenshot({ path: `test-shots/fx-${speciesId}-ult-charge.png` });
  await page.waitForTimeout(750);
  await page.screenshot({ path: `test-shots/fx-${speciesId}-ult-main.png` });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-shots/fx-${speciesId}-ult-impact.png` });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-shots/fx-${speciesId}-ult-tail.png` });
  console.log(`${speciesId}: done`);
  await context.close();
}

await browser.close();
console.log("all done");
