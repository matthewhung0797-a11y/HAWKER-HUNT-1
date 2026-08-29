// 診斷：按鈕音效實際有冇發聲——監察 oscillator 建立＋音樂 ducking
import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  locale: "zh-TW",
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({
      state: { nickname: "T", level: 3, exp: 0, coins: 0, gems: 0, factionId: "central", onboardingDone: true, loggedIn: true, devMode: false, ownedSpirits: [], captureCounts: {}, items: {}, checkins: [], unlockedSilhouettes: [], favouriteCentres: [], battleWins: 0, counterWins: 0, evolveCount: 0 },
      version: 0,
    })
  );
  // 數 oscillator 建立次數（sfx 有出聲嘅證據）
  window.__oscCount = 0;
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...args) {
    window.__oscCount++;
    return orig.apply(this, args);
  };
  // 記錄音樂 audio element
  window.__audios = [];
  const NativeAudio = window.Audio;
  window.Audio = function (src) {
    const a = new NativeAudio(src);
    window.__audios.push(a);
    return a;
  };
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:3000/profile", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// 撳一下掣，之後即刻讀 oscillator 數＋mute 狀態
const before = await page.evaluate(() => window.__oscCount);
await page.tap("text=Dev Mode");
const after = await page.evaluate(() => ({
  osc: window.__oscCount,
  ctxState: (() => {
    try {
      return "n/a";
    } catch {
      return "?";
    }
  })(),
  sfxMuted: localStorage.getItem("hh-sfx-muted"),
}));
console.log(`撳掣後新增 oscillator: ${after.osc - before}（>0 = 有出聲）`);
console.log("sfx muted flag:", after.sfxMuted ?? "(未設，默認冇 mute)");

// 地圖頁：音樂 + ducking
await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
await page.tap("body");
await page.waitForTimeout(2500);
const volBefore = await page.evaluate(() => window.__audios.at(-1)?.volume ?? -1);
await page.tap('button[aria-label="sound"]'); // 任何掣都得，呢個實測 ducking
const volJustAfter = await page.evaluate(() => window.__audios.at(-1)?.volume ?? -1);
await page.waitForTimeout(600);
const volRecovered = await page.evaluate(() => window.__audios.at(-1)?.volume ?? -1);
console.log(`音樂 ducking: ${volBefore.toFixed(2)} → 撳掣即刻 ${volJustAfter.toFixed(2)} → 600ms 後 ${volRecovered.toFixed(2)}`);
console.log("ducking 生效:", volJustAfter < volBefore * 0.6 ? "✔" : "✘");
console.log("音量有回復:", volRecovered > volJustAfter ? "✔" : "✘");

await browser.close();
console.log("診斷完成");
