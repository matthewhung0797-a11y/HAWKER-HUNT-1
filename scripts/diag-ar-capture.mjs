// 診斷：AR 捕捉升級——
// 1) 冇相機權限 → 自動落 3D 場景保底模式（天幕＋地面＋氛圍粒子）
// 2) 皮克敏式互動：摸頭（心心＋對白）＋餵食（掟小食 → 安撫 buff）
// 3) 安撫狀態下照常完成成個捕捉流程（縮圈 → 搏鬥 → 成功）
// 4) 模式切換掣存在
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

// 冇 fake camera flags＋冇 camera permission → getUserMedia 會被拒 → 3D 模式
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
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
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));

await page.goto(`${BASE}/capture?species=little-laksa&centre=maxwell`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.locator("button", { hasText: "開始" }).first().click();
await page.waitForTimeout(3000); // 等 3D 場景＋精靈 GLB 載入

// ── 1：3D 模式確認（相機被拒 → AR 不可用 → 切換掣應該隱藏） ──
const mode3d = await page.locator("text=3D 場景模式").count();
const toggleBtn = await page.locator("button", { hasText: "AR 實景" }).count();
console.log(
  "3D 場景模式標示:",
  mode3d > 0 ? "✔" : "✘",
  "| AR 切換掣正確隱藏（冇相機權限）:",
  toggleBtn === 0 ? "✔" : "✘"
);
await page.screenshot({ path: "test-shots/ar-1-scene3d.png" });

// ── 2a：摸頭互動 ──
const petBtn = page.locator('button[aria-label="pet"]');
let heartsSeen = false;
let petTried = 0;
for (let i = 0; i < 3; i++) {
  const box = await petBtn.boundingBox().catch(() => null);
  if (!box) break;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  petTried++;
  await page.waitForTimeout(250);
  if ((await page.locator(".heart-float").count()) > 0) heartsSeen = true;
  if (i === 0) await page.screenshot({ path: "test-shots/ar-2-pet.png" });
  await page.waitForTimeout(1200);
}
console.log(`摸頭 ${petTried} 次 | 心心出現:`, heartsSeen ? "✔" : "✘");

// ── 2b：餵食 → 安撫 ──
const snackBtn = page.locator('button[aria-label="小食"]');
const snackBox = await snackBtn.boundingBox().catch(() => null);
if (snackBox) {
  await page.touchscreen.tap(snackBox.x + snackBox.width / 2, snackBox.y + snackBox.height / 2);
  console.log("掟小食 ✔");
  // 精靈行去食物＋食嘢需時
  let calmSeen = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(300);
    if ((await page.locator("text=安撫中").count()) > 0) {
      calmSeen = true;
      break;
    }
  }
  console.log("安撫狀態出現:", calmSeen ? "✔" : "✘");
  await page.screenshot({ path: "test-shots/ar-3-feed-calm.png" });
} else {
  console.log("小食掣搵唔到 ✘");
}

// ── 3：安撫狀態下完成捕捉 ──
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
  for (let i = 0; i < 900; i++) {
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
console.log("夾時機:", clicked);
await page.waitForTimeout(600);

const struggleBtn = page.locator("button", { hasText: "狂撳" });
const sBox = await struggleBtn.boundingBox().catch(() => null);
if (sBox) {
  for (let i = 0; i < 400; i++) {
    try {
      await page.touchscreen.tap(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
    } catch {
      break;
    }
    await page.waitForTimeout(110);
    if (i % 4 === 3 && (await struggleBtn.count()) === 0) break;
  }
}
await page.waitForTimeout(1200);
const success = await page.locator("text=捕捉成功").count();
console.log("捕捉成功畫面:", success > 0 ? "✔" : "（可能夾空／掙甩，屬正常隨機）");
await page.screenshot({ path: "test-shots/ar-4-result.png" });

await browser.close();
console.log("診斷完成");
