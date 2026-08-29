// 模型檢視器診斷：影唔同動畫 clip 嘅截圖
import { chromium } from "playwright";

const species = process.argv[2] ?? "laksa-warrior";
const anims = (process.argv[3] ?? "idle,walk,attack,victory").split(",");
// dev server port 可配置（本機常見 3001；設 DIAG_BASE 覆蓋）
const BASE = process.env.DIAG_BASE ?? "http://localhost:3000";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("BBOX") || m.type() === "error") console.log(`[${m.type()}]`, t.slice(0, 220));
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 250)));

for (const anim of anims) {
  await page.goto(`${BASE}/dev/model?species=${species}&anim=${anim}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `test-shots/model-${species}-${anim}.png` });
  console.log(`shot ${anim}`);
}
await browser.close();
