// 診斷：捕捉新機制——閃光變異（?shiny=1）＋搏鬥狂暴時刻＋捕獲後 shiny 入存檔
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

await page.goto(`${BASE}/capture?species=oily-rice-chick&shiny=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.locator("button", { hasText: "開始" }).first().click();
await page.waitForTimeout(2500);

const shinyBadge = await page.locator("text=閃光精靈").count();
console.log("閃光徽章顯示:", shinyBadge > 0 ? "✔" : "✘");
await page.screenshot({ path: "test-shots/diag-cap2-1-shiny-aim.png" });

// 等金圈縮到 ~1.0x 撳夾
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
      if (Math.abs(s - 1) < 0.05) {
        btn.click();
        return `clicked at scale ${s.toFixed(3)}`;
      }
    }
    await new Promise((r) => setTimeout(r, 8));
  }
  return "timeout";
});
console.log("timing:", clicked);
await page.waitForTimeout(500);

// 搏鬥：節制咁撳（等狂暴有機會出現），同時偵測狂暴標籤
let sawFrenzy = false;
let result = "still struggling";
const btn = page.locator("button", { hasText: "狂撳" });
const box = await btn.boundingBox();
if (!box) {
  console.log("搏鬥按鈕唔存在（可能夾空咗）");
} else {
  const t0 = Date.now();
  let shotTaken = false;
  for (let i = 0; i < 400; i++) {
    try {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } catch {
      break;
    }
    await page.waitForTimeout(110); // 模擬真人狂撳速度（約 7–8 下/秒）
    if (i % 4 === 3) {
      const frenzyVisible = await page.locator("text=狂暴中").count();
      if (frenzyVisible > 0) {
        sawFrenzy = true;
        if (!shotTaken) {
          shotTaken = true;
          await page.screenshot({ path: "test-shots/diag-cap2-2-frenzy.png" });
        }
      }
      if ((await btn.count()) === 0) {
        result = `結束於 ${i + 1} taps（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`;
        break;
      }
    }
  }
}
console.log("狂暴時刻出現過:", sawFrenzy ? "✔" : "✘");
console.log("搏鬥:", result);
await page.waitForTimeout(1000);
await page.screenshot({ path: "test-shots/diag-cap2-3-result.png" });

// 檢查存檔 shiny flag
const save = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("hawker-hunt-save") ?? "{}");
  return (s.state?.ownedSpirits ?? []).map((sp) => ({ speciesId: sp.speciesId, shiny: sp.shiny ?? false }));
});
console.log("存檔精靈:", JSON.stringify(save));

await browser.close();
console.log("診斷完成");
