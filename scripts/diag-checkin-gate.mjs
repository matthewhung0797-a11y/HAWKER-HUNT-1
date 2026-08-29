// 驗證：打卡關卡後移——GPS 遠離時地圖打卡掣仍然可撳（唔再被 50 米禁用）
// 用法：node scripts/diag-checkin-gate.mjs
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  // 定位喺麥士威北面約 150m（>50m 嚴格閘、亦 >100m 容差）——測 fail-open 後掣仲撳唔撳得，
  // 但又夠近令據點 marker 留喺視窗內方便撳
  geolocation: { latitude: 1.28165, longitude: 103.8445 },
  permissions: ["geolocation"],
  locale: "zh-TW",
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));

await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
await page.waitForTimeout(5000);

// 撳一個喺視窗內嘅據點 marker 開資訊卡
const markers = page.locator(".maplibregl-marker");
const n = await markers.count();
let clicked = false;
for (let i = 0; i < n; i++) {
  const m = markers.nth(i);
  const box = await m.boundingBox();
  if (box && box.x > 0 && box.y > 80 && box.x < 380 && box.y < 700) {
    await m.click({ force: true });
    clicked = true;
    break;
  }
}
console.log("marker clicked:", clicked, "of", n);
await page.waitForTimeout(1200);

// 讀打卡掣（bottom sheet 最後一個 btn）：睇 disabled 同文字
const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll(".slide-up button")];
  const checkinBtn = btns.find((b) => /掃碼打卡|行近啲|可以打卡|已達/.test(b.textContent || ""));
  return {
    sheetOpen: !!document.querySelector(".slide-up"),
    checkinLabel: checkinBtn?.textContent?.trim() ?? null,
    checkinDisabled: checkinBtn ? checkinBtn.disabled : null,
    checkinClass: checkinBtn?.className ?? null,
  };
});
console.log(JSON.stringify(info, null, 2));
console.log(
  info.checkinDisabled === false && /掃碼打卡/.test(info.checkinLabel ?? "")
    ? "PASS：GPS 遠離但打卡掣可撳 ✔"
    : "CHECK：掣狀態同預期唔同 ✘"
);

await page.screenshot({ path: "test-shots/checkin-gate.png" });
await browser.close();
