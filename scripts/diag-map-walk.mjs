import { chromium } from "playwright";

// 觀察野生精靈有冇沿住街道行走（唔 tap，隔幾秒影一次睇位移軌跡）
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 1.28027, longitude: 103.84449 }, // 麥士威
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
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 400)));

await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
await page.waitForTimeout(8000); // 等飛入 + idle 後 snap 落道路

// 攞頭幾隻野生精靈嘅屏幕座標
async function positions() {
  return page.evaluate(() => {
    const markers = [...document.querySelectorAll(".maplibregl-marker")].filter((m) => {
      if (m.querySelector(".player-radar")) return false;
      const img = m.querySelector("img");
      return img && img.getAttribute("src")?.includes("/spirits/full/");
    });
    return markers.slice(0, 6).map((m) => {
      const r = m.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height)];
    });
  });
}

for (let i = 0; i < 4; i++) {
  console.log(`t=${i * 3}s`, JSON.stringify(await positions()));
  await page.screenshot({ path: `test-shots/map-walk-${i}.png` });
  await page.waitForTimeout(3000);
}

await browser.close();
