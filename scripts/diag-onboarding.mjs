// 新手導覽全程診斷：宗師對白 → 第一課縮圈（等金圈貼紅圈先撳）→ 第二課狂撳
// （中途應該出一波迷你狂暴）→ 捉到 → 世界導覽 → 出發去 /login。每幕截圖。
// Run: node scripts/diag-onboarding.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
  locale: "zh-TW",
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

const results = {};
await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
await page.getByTestId("onb-hello").waitFor({ timeout: 10000 });
await page.waitForTimeout(1200); // 等打字機出字先影
await page.screenshot({ path: "test-shots/onb-hello.png" });

// 對白：撳到入第一課為止（每句要撳兩下：出晒字＋落一句）
for (let i = 0; i < 12; i++) {
  if (await page.getByTestId("onb-ring").count()) break;
  await page.getByTestId("onb-hello").click();
  await page.waitForTimeout(250);
}
results.reachedAim = (await page.getByTestId("onb-ring").count()) > 0;

// 第一課：喺瀏覽器入面等金圈貼住紅圈（dataset.s ≈ 1）先撳，避免 JS 往返延遲夾空
await page.evaluate(
  () =>
    new Promise((res) => {
      const check = () => {
        const el = document.querySelector('[data-testid="onb-ring"]');
        const s = parseFloat((el && el.dataset.s) || "9");
        if (Math.abs(s - 1) < 0.06) {
          document.querySelector('[data-testid="onb-aim-tap"]').click();
          res(null);
        } else requestAnimationFrame(check);
      };
      check();
    })
);
await page.getByTestId("onb-aim-good").waitFor({ timeout: 3000 });
results.aimGood = true;
await page.screenshot({ path: "test-shots/onb-aim.png" });

// 第二課：狂撳到捉到；狂暴出現嗰刻影相
await page.getByTestId("onb-mash-tap").waitFor({ timeout: 5000 });
let frenzySeen = false;
for (let i = 0; i < 60; i++) {
  if (await page.getByTestId("onb-caught").count()) break;
  if (!frenzySeen && (await page.getByTestId("onb-frenzy").count())) {
    frenzySeen = true;
    await page.screenshot({ path: "test-shots/onb-frenzy.png" });
  }
  // 搖擺動畫令 .click() 過唔到 stability check——用 dispatchEvent 直接派 click
  await page
    .getByTestId("onb-mash-tap")
    .dispatchEvent("click")
    .catch(() => {});
  await page.waitForTimeout(70);
}
results.frenzySeen = frenzySeen;
await page.getByTestId("onb-caught").waitFor({ timeout: 5000 });
results.caught = true;
await page.waitForTimeout(600);
await page.screenshot({ path: "test-shots/onb-caught.png" });

// 世界導覽 → 出發 → 應該去 /login（completeOnboarding 已寫入 store）
await page.getByTestId("onb-caught-next").click();
await page.getByTestId("onb-start").waitFor({ timeout: 5000 });
await page.waitForTimeout(900);
await page.screenshot({ path: "test-shots/onb-world.png" });
await page.getByTestId("onb-start").click();
await page.waitForURL(/\/login/, { timeout: 8000 });
results.finishedToLogin = true;
const save = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem("hawker-hunt-save") || "{}").state?.onboardingDone ?? null;
  } catch {
    return null;
  }
});
results.onboardingDoneFlag = save;

console.log(JSON.stringify(results, null, 2));
const pass =
  results.reachedAim && results.aimGood && results.frenzySeen && results.caught && results.finishedToLogin;
console.log(pass ? "PASS" : "CHECK: 流程有異常");
await browser.close();
