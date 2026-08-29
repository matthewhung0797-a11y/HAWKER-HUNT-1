// 驗證捕捉入場：精靈要喺畫面中間登場，唔好誤報「走咗出鏡」，之後遊走都唔貼邊。
// Run: node scripts/diag-spirit-center.mjs [speciesId]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SPECIES = process.argv[2] ?? "oily-rice-chick";
const VW = 390;
const VH = 844;
mkdirSync("test-shots", { recursive: true });

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, locale: "zh-TW", deviceScaleFactor: 2 });
await context.addInitScript(() => {
  if (!localStorage.getItem("hawker-hunt-save")) {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
    );
  }
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));

await page.goto(`${BASE}/capture?species=${SPECIES}&mode=3d&debug=1`, { waitUntil: "domcontentloaded" });
// 等 GLB 預載（intro 期間已經 mount），模擬真人唔會即撳
await page.waitForTimeout(2500);
const hintsDuringLoad = [];
await page.getByTestId("start").click({ timeout: 20000 });

const samples = [];
for (let i = 0; i < 30; i++) {
  const s = await page.evaluate(() => (window.__cap ? window.__cap() : null));
  const hint = await page.evaluate(() =>
    [...document.querySelectorAll("span")].some((n) => /走咗出鏡|轉身搵返|搵返佢/.test(n.textContent ?? ""))
  );
  if (s) samples.push({ t: +(i * 0.4).toFixed(1), x: Math.round(s.trackX), y: Math.round(s.trackY), on: s.onScreen });
  if (hint) hintsDuringLoad.push(+(i * 0.4).toFixed(1));
  if (i === 1) await page.screenshot({ path: "test-shots/center-enter.png" });
  if (i === 12) await page.screenshot({ path: "test-shots/center-mid.png" });
  await page.waitForTimeout(400);
}
await page.screenshot({ path: "test-shots/center-late.png" });

const cx = VW / 2;
const onScreenSamples = samples.filter((s) => s.on);
const offsets = onScreenSamples.map((s) => Math.abs(s.x - cx) / cx); // 0 = 正中, 1 = 邊緣
console.log(
  JSON.stringify(
    {
      species: SPECIES,
      centreX: cx,
      first3: samples.slice(0, 3),
      maxHorizOffsetPct: offsets.length ? Math.round(Math.max(...offsets) * 100) : null,
      avgHorizOffsetPct: offsets.length ? Math.round((offsets.reduce((a, b) => a + b, 0) / offsets.length) * 100) : null,
      offScreenSamples: samples.filter((s) => !s.on).map((s) => s.t),
      offScreenHintShownAt: hintsDuringLoad,
      track: samples,
    },
    null,
    2
  )
);
await context.close();
await browser.close();
