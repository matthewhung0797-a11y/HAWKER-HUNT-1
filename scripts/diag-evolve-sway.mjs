// 驗進化成功畫面嘅 idle 左右擺：對 fullRig 精靈（如 chilli-crab-king），
// 喺 done 幕相隔 ~1.4s 影兩張，肉眼比對鉗/身位有冇左右擺（唔應該完全靜止）。
// Run: FROM=crab-claw-warrior node scripts/diag-evolve-sway.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const UID = "evo-sway-uid";
const FROM = process.env.FROM || "crab-claw-warrior"; // evolvesTo=chilli-crab-king（fullRig）
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
  locale: "zh-TW",
  deviceScaleFactor: 2,
});
await context.addInitScript(
  ([uid, from]) => {
    if (!localStorage.getItem("hawker-hunt-save")) {
      localStorage.setItem(
        "hawker-hunt-save",
        JSON.stringify({
          state: {
            loggedIn: true,
            onboardingDone: true,
            nickname: "T",
            ownedSpirits: [
              { uid, speciesId: from, level: 5, caughtAt: Date.now(), centreId: "maxwell" },
            ],
          },
          version: 0,
        })
      );
    }
  },
  [UID, FROM]
);
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 160)));
await page.goto(`${BASE}/evolve/${UID}`, { waitUntil: "domcontentloaded" });
// 等到 done（~5.6s+）
await page.waitForTimeout(6000);
await page.screenshot({ path: "test-shots/evolve-sway-a.png" });
await page.waitForTimeout(1400);
await page.screenshot({ path: "test-shots/evolve-sway-b.png" });
console.log("shots: test-shots/evolve-sway-a.png / -b.png（比對鉗位有冇左右擺）");
await browser.close();
