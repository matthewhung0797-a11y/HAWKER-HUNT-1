// 進化特效診斷：預填一隻 stage-1（有 evolvesTo）精靈落 save，開 /evolve/<uid>，
// 喺蓄勢／變形交替閃／揭曉／慶祝各幕截圖，並確認 evolveSpirit 生效（speciesId 變咗）。
// 跑兩個 case：普通 + shiny（虹彩演出應該同普通版有明顯分別）。
// Run: node scripts/diag-evolve-fx.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const UID = "evo-test-uid";
const FROM = process.env.FROM || "oily-rice-chick"; // 可用 FROM=<id> 換一隻嚟驗朝向
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

async function runCase(shiny) {
  const tag = shiny ? "shiny" : "normal";
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
  });
  await context.addInitScript(
    ([uid, from, isShiny]) => {
      // 只喺未有 save 時預填，避免洗檔
      if (!localStorage.getItem("hawker-hunt-save")) {
        localStorage.setItem(
          "hawker-hunt-save",
          JSON.stringify({
            state: {
              loggedIn: true,
              onboardingDone: true,
              nickname: "T",
              // 進化條件：oily-rice-chick 需 5 chicken-oil-essence ＋打卡 2 個中心
              items: { "chicken-oil-essence": 5 },
              checkins: [
                { centreId: "maxwell", date: "2026-07-24", timestamp: Date.now() },
                { centreId: "chinatown-complex", date: "2026-07-24", timestamp: Date.now() },
              ],
              ownedSpirits: [
                {
                  uid,
                  speciesId: from,
                  level: 5,
                  caughtAt: Date.now(),
                  centreId: "maxwell",
                  ...(isShiny ? { shiny: true } : {}),
                },
              ],
            },
            version: 0,
          })
        );
      }
    },
    [UID, FROM, shiny]
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`  [${tag} pageerror]`, e.message.slice(0, 160)));

  await page.goto(`${BASE}/evolve/${UID}`, { waitUntil: "domcontentloaded" });
  // 蓄勢（~0.9s 內）
  await page.waitForTimeout(900);
  await page.screenshot({ path: `test-shots/evolve-${tag}-1-charge.png` });
  // 變形交替閃（~2.5s）
  await page.waitForTimeout(1700);
  await page.screenshot({ path: `test-shots/evolve-${tag}-2-morph.png` });
  // 揭曉（~4.4s）
  await page.waitForTimeout(1700);
  await page.screenshot({ path: `test-shots/evolve-${tag}-3-reveal.png` });
  // 慶祝（~5.6s+）
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `test-shots/evolve-${tag}-4-done.png` });

  const evolvedTo = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem("hawker-hunt-save") || "{}");
      return s.state?.ownedSpirits?.[0]?.speciesId ?? null;
    } catch {
      return null;
    }
  });
  const stillShiny = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem("hawker-hunt-save") || "{}");
      return Boolean(s.state?.ownedSpirits?.[0]?.shiny);
    } catch {
      return false;
    }
  });
  const hasContinue = await page.getByText("繼續").count();
  await context.close();
  return { evolvedTo, stillShiny, hasContinue: hasContinue > 0 };
}

const normal = await runCase(false);
const shiny = await runCase(true);
console.log(JSON.stringify({ normal, shiny }, null, 2));
const pass =
  normal.evolvedTo && normal.evolvedTo !== FROM && normal.hasContinue &&
  shiny.evolvedTo && shiny.evolvedTo !== FROM && shiny.stillShiny && shiny.hasContinue;
console.log(pass ? "PASS" : "CHECK: 流程有異常");
await browser.close();
