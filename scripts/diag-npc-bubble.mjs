// 臨時診斷：3D 場景背景 NPC 對話泡泡有冇出現
// 用法：node scripts/diag-npc-bubble.mjs [centreId]
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const centre = process.argv[2] ?? "lau-pa-sat";

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ["camera"],
  locale: "zh-TW",
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T", level: 3 }, version: 0 })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));

await page.goto(`${BASE}/capture?species=oily-rice-chick&centre=${centre}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.locator("button", { hasText: "即時開始玩" }).first().click();
await page.waitForTimeout(2000);

for (let i = 0; i < 3; i++) {
  if ((await page.locator("text=3D 場景模式").count()) > 0) break;
  const toggle = page.locator('button[aria-label="切換 3D 場景"]');
  if ((await toggle.count()) > 0) {
    await toggle.first().click();
    await page.waitForTimeout(1800);
  } else break;
}
console.log(`[${centre}] 3D 場景模式:`, (await page.locator("text=3D 場景模式").count()) > 0 ? "✔" : "✘");

// NPC 閒逛對白（zh.json capture.bubblesNpc 嘅識別關鍵字）
const npcWords = ["邊檔開爐", "人流幾旺", "行過睇下", "幫手開檔", "有嘢睇喎"];
let found = null;
for (let s = 0; s < 120 && !found; s++) {
  await page.waitForTimeout(250);
  for (const w of npcWords) {
    if ((await page.locator(`text=${w}`).count()) > 0) {
      found = w;
      break;
    }
  }
}
if (found) {
  await page.screenshot({ path: `test-shots/npc-bubble-${centre}.png` });
  const box = await page.locator(`text=${found}`).first().boundingBox();
  console.log(`NPC 泡泡出現 ✔ →「${found}」 @`, JSON.stringify(box));
  console.log("截圖 →", `test-shots/npc-bubble-${centre}.png`);
} else {
  console.log("NPC 泡泡 30 秒內未出現 ✘");
  await page.screenshot({ path: `test-shots/npc-bubble-${centre}-miss.png` });
}
await browser.close();
