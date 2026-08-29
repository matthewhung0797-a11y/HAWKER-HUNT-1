import { chromium } from "playwright";

// 驗證：地圖野生精靈（1）數量夠多（3–5/據點）（2）固定命中區撳得中 → 跳去 /capture
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
// 等開場飛入到高 zoom（野生精靈 zoom>=14.2 先現形）
await page.waitForTimeout(7000);

// 數野生精靈 marker（img src 含 /spirits/full/，排除主角 avatar：佢有 .player-radar）
const wild = await page.evaluate(() => {
  const markers = [...document.querySelectorAll(".maplibregl-marker")];
  const wilds = markers.filter((m) => {
    if (m.querySelector(".player-radar")) return false;
    const img = m.querySelector("img");
    return img && img.getAttribute("src")?.includes("/spirits/full/");
  });
  return {
    total: markers.length,
    wildCount: wilds.length,
    // 攞第一隻可見（opacity>0）野生精靈嘅命中區中心
    firstHit: (() => {
      for (const w of wilds) {
        const scaler = w.firstElementChild;
        if (scaler && getComputedStyle(scaler).opacity === "0") continue;
        const hit = w.querySelector('div[style*="cursor:pointer"], div[style*="cursor: pointer"]');
        if (!hit) continue;
        const r = hit.getBoundingClientRect();
        if (r.width < 8) continue;
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width) };
      }
      return null;
    })(),
  };
});
console.log("[wild]", JSON.stringify(wild));

await page.screenshot({ path: "test-shots/map-wild.png" });

// 模擬 tap 野生精靈：mouse down→up（<500ms 無位移＝tap；期間精靈被凍住）
if (wild.firstHit) {
  await page.mouse.move(wild.firstHit.x, wild.firstHit.y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  console.log("[after-tap] url =", page.url());
  await page.screenshot({ path: "test-shots/map-wild-after-tap.png" });
} else {
  console.log("[after-tap] 冇搵到可撳嘅野生精靈命中區");
}

await browser.close();
