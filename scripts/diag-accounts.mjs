// 玩家帳號 / 雲存檔 / 寵物後台 —— 渲染 smoke test（唔撳會建 auth user 嘅掣，避免污染真 project）。
// 只確認新 code path（login 頁掣、profile 帳號卡、founder 寵物 section）渲染唔炸。

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const OPS = "f0326cefeca745635a00b18bbf63a7987526be94d1b4c33a";
const OUT = "test-shots/accounts";
mkdirSync(OUT, { recursive: true });

const SAVE = {
  state: {
    nickname: "TestHunter",
    level: 7,
    exp: 120,
    coins: 850,
    gems: 20,
    factionId: "central",
    onboardingDone: true,
    loggedIn: true,
    devMode: false,
    ownedSpirits: [
      { uid: "a1", speciesId: "oily-rice-chick", level: 5, caughtAt: Date.now(), centreId: "maxwell" },
      { uid: "a2", speciesId: "little-laksa", level: 8, caughtAt: Date.now(), centreId: "maxwell", shiny: true },
    ],
    captureCounts: { "oily-rice-chick": 3, "little-laksa": 1 },
    items: { "spice-essence": 4 },
    checkins: [],
    unlockedSilhouettes: [],
    favouriteCentres: [],
    lastBattleUid: null,
    battleWins: 2,
    counterWins: 1,
    evolveCount: 0,
  },
  version: 0,
};

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

async function prefill() {
  await page.addInitScript((save) => {
    if (!localStorage.getItem("hawker-hunt-save")) {
      localStorage.setItem("hawker-hunt-save", JSON.stringify(save));
    }
  }, SAVE);
}

async function shot(path, name) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  截圖 ${name} ← ${path}`);
}

console.log("=== 帳號 / 雲存檔 / 寵物後台 smoke test ===");
await shot("/login", "01-login");
await prefill();
await shot("/profile", "02-profile");
await shot(`/founder?key=${OPS}`, "03-founder");

await browser.close();
console.log(errors.length ? `\n⚠️ 頁面錯誤 ${errors.length} 條：\n${errors.slice(0, 20).join("\n")}` : "\n✅ 三頁渲染無 runtime error");
