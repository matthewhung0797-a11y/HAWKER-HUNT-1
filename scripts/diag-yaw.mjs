// 臨時：yaw sweep 搵靜態 Tripo mesh 正確朝向（配合 Line B 修復）
import { chromium } from "playwright";
import sharp from "sharp";
const id = process.argv[2];
const yaws = (process.argv[3] ?? "0,90,180,270").split(",");
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
const cells = [];
for (const y of yaws) {
  await page.goto(`http://localhost:3000/dev/model?species=${id}&anim=none&yaw=${y}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: ".absolute{display:none !important}" });
  await page.waitForTimeout(1500);
  const buf = await page.screenshot();
  const lab = Buffer.from(`<svg width="300" height="20"><rect width="300" height="20" fill="#111"/><text x="4" y="15" font-family="monospace" font-size="13" fill="#fff">${id} yaw=${y}</text></svg>`);
  cells.push(await sharp(buf).composite([{ input: lab, top: 0, left: 0 }]).png().toBuffer());
}
await browser.close();
const composites = cells.map((c, i) => ({ input: c, left: i * 300, top: 0 }));
await sharp({ create: { width: 300 * cells.length, height: 300, channels: 3, background: "#222" } })
  .composite(composites).png().toFile(`test-shots/faces/yaw-${id}.png`);
console.log(`→ test-shots/faces/yaw-${id}.png`);
