// 診斷：實測捕捉縮圈時機 + 搏鬥階段（睇準金圈貼合紅圈時撳夾，然後狂撳）
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

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
    JSON.stringify({
      state: { nickname: "T", level: 3, exp: 0, coins: 0, gems: 0, factionId: "central", onboardingDone: true, loggedIn: true, devMode: false, ownedSpirits: [], captureCounts: {}, items: {}, checkins: [], unlockedSilhouettes: [], favouriteCentres: [] },
      version: 0,
    })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/capture?species=oily-rice-chick`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.click("text=即時開始玩");
await page.waitForTimeout(2500);

// 等金圈縮到 ~1.0x 先撳夾（讀 inline transform）
const clicked = await page.evaluate(async () => {
  const findRing = () => {
    const target = document.querySelector('[data-ring="target"]');
    if (!target) return null;
    for (const div of target.querySelectorAll("div")) {
      const tr = div.style.transform;
      if (tr && tr.startsWith("scale(")) return div;
    }
    return null;
  };
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("夾"));
  if (!btn) return "no button";
  for (let i = 0; i < 600; i++) {
    const ring = findRing();
    if (ring) {
      const s = parseFloat(ring.style.transform.slice(6));
      if (Math.abs(s - 1) < 0.06) {
        btn.click();
        return `clicked at scale ${s.toFixed(3)}`;
      }
    }
    await new Promise((r) => setTimeout(r, 8));
  }
  return "timeout";
});
console.log("timing:", clicked);
await page.waitForTimeout(400);
await page.screenshot({ path: "test-shots/diag-struggle-1.png" });

// 搏鬥：狂撳（Playwright 真實 touch 事件，全速）
let result = "still struggling";
const btn = page.locator("button", { hasText: "狂撳" });
const box = await btn.boundingBox();
for (let i = 0; i < 80; i++) {
  try {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } catch {
    result = `tap failed at ${i}`;
    break;
  }
  if (i % 10 === 9 && (await btn.count()) === 0) {
    result = `caught after ~${i + 1} taps`;
    break;
  }
}
console.log("struggle:", result);
await page.waitForTimeout(800);
await page.screenshot({ path: "test-shots/diag-struggle-2.png" });
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300).replaceAll("\n", " | "));
console.log("final:", bodyText);

await browser.close();
