// 音樂播放端到端診斷：地圖頁 → 手勢 → 檢查 Audio 播放中；戰鬥頁 → 檢查換咗場景 track
import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--autoplay-policy=user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  hasTouch: true,
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: {
        loggedIn: true,
        onboardingDone: true,
        nickname: "T",
        level: 5,
        exp: 0,
        coins: 500,
        gems: 20,
        ownedSpirits: [
          { uid: "test1", speciesId: "laksa-warrior", level: 7, caughtAt: Date.now(), centreId: "maxwell" },
        ],
        captureCounts: { "laksa-warrior": 1 },
        items: {},
        checkins: [],
        unlockedSilhouettes: [],
        favouriteCentres: [],
      },
      version: 0,
    })
  );
  // 攔截 Audio 建立，記錄 src / 播放狀態
  const audios = [];
  window.__audios = audios;
  const NativeAudio = window.Audio;
  window.Audio = function (src) {
    const a = new NativeAudio(src);
    audios.push(a);
    return a;
  };
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));

const snapshot = () =>
  page.evaluate(() =>
    (window.__audios ?? []).map((a) => ({
      src: a.src.split("/").slice(-2).join("/"),
      paused: a.paused,
      loop: a.loop,
      vol: Math.round(a.volume * 100) / 100,
      time: Math.round(a.currentTime * 10) / 10,
    }))
  );

// ── 地圖頁：autoplay 被拒 → 手勢後應該開波 ──
await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("map 頁載入後（未有手勢）:", JSON.stringify(await snapshot()));
await page.tap("body");
await page.waitForTimeout(2500);
console.log("map 手勢＋2.5 秒後:", JSON.stringify(await snapshot()));

// ── 戰鬥頁（指定竹腳場景）：應該交叉淡入 tekka-centre track ──
await page.goto("http://localhost:3000/battle?centre=tekka-centre", { waitUntil: "networkidle" });
await page.tap("body");
await page.waitForTimeout(3500);
console.log("battle(tekka) 3.5 秒後:", JSON.stringify(await snapshot()));

await browser.close();
console.log("診斷完成");
