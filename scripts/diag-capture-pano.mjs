// 診斷：3D 保底捕捉場景嘅全景天幕（skybox sphere）＋瓷磚地板＋視差拖動
// 用法：node scripts/diag-capture-pano.mjs [centreId]
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const centre = process.argv[2] ?? "maxwell";

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

// 撳切換掣直到入到 3D 場景模式
for (let i = 0; i < 3; i++) {
  if ((await page.locator("text=3D 場景模式").count()) > 0) break;
  const toggle = page.locator('button[aria-label="切換 3D 場景"]');
  if ((await toggle.count()) > 0) {
    await toggle.first().click();
    await page.waitForTimeout(1800);
  } else break;
}
const in3d = (await page.locator("text=3D 場景模式").count()) > 0;
console.log(`[${centre}] 3D 場景模式:`, in3d ? "✔" : "✘");
await page.waitForTimeout(1200);
await page.screenshot({ path: `test-shots/pano-${centre}-a.png` });

// 視差拖動：由左掃到右，睇天幕連續轉動
const cx = 195;
const cy = 420;
await page.mouse.move(cx + 130, cy);
await page.mouse.down();
for (let x = cx + 130; x >= cx - 130; x -= 26) {
  await page.mouse.move(x, cy);
  await page.waitForTimeout(40);
}
await page.mouse.up();
await page.waitForTimeout(400);
await page.screenshot({ path: `test-shots/pano-${centre}-b.png` });

await browser.close();
console.log("診斷完成 →", `test-shots/pano-${centre}-a.png`, `test-shots/pano-${centre}-b.png`);
