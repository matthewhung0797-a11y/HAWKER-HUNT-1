import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 1.28027, longitude: 103.84449 },
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
page.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 250)));
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 400)));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 100), r.failure()?.errorText));

await page.goto("http://localhost:3000/map", { waitUntil: "networkidle" });
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const mapEl = document.querySelector(".maplibregl-map");
  const canvas = document.querySelector(".maplibregl-canvas");
  const markers = [...document.querySelectorAll(".maplibregl-marker")];
  // maplibre CSS 有冇真係載入？
  let cssLoaded = false;
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.cssText?.includes(".maplibregl-map")) { cssLoaded = true; break; }
      }
    } catch { /* cross-origin */ }
    if (cssLoaded) break;
  }
  const container = mapEl?.parentElement;
  return {
    mapElExists: !!mapEl,
    mapElRect: mapEl ? JSON.parse(JSON.stringify(mapEl.getBoundingClientRect())) : null,
    containerClass: container?.className,
    containerRect: container ? JSON.parse(JSON.stringify(container.getBoundingClientRect())) : null,
    canvasSize: canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight } : null,
    canvasStyle: canvas ? getComputedStyle(canvas).cssText.slice(0, 0) || {
      position: getComputedStyle(canvas).position,
      width: getComputedStyle(canvas).width,
      height: getComputedStyle(canvas).height,
    } : null,
    markerCount: markers.length,
    markerRects: markers.slice(0, 3).map((m) => JSON.parse(JSON.stringify(m.getBoundingClientRect()))),
    markerPosition: markers[0] ? getComputedStyle(markers[0]).position : null,
    cssLoaded,
    tileImgs: document.querySelectorAll(".maplibregl-canvas-container img").length,
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: "test-shots/diag-map.png" });
await browser.close();
