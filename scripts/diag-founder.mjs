// 診斷：截圖 /founder dashboard（離線示範數據）確認視覺效果
import { chromium } from "playwright";

const PORT = process.env.PORT || 3001;
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
await page.goto(`http://localhost:${PORT}/founder`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: "test-shots/founder-dashboard.png", fullPage: true });
console.log("saved test-shots/founder-dashboard.png");
await browser.close();
