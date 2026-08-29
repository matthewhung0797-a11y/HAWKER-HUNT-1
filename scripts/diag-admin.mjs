// 後台 /admin 視覺診斷 + auth gate 測試（單一 dev server，用 --mode 切換）。
//   node scripts/diag-admin.mjs --mode=gate    # 冇 bypass 嘅 server：/admin 應彈去 /admin/login
//   node scripts/diag-admin.mjs --mode=shots   # ADMIN_DIAG_BYPASS=1 嘅 server：截各頁圖
// base 預設 http://localhost:3000（可 --base=... 覆蓋）。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const MODE = args.mode ?? "shots";
const BASE = args.base ?? "http://localhost:3000";

mkdirSync("test-shots", { recursive: true });

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-HK" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

async function shot(path, name, waitMs = 2600) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `test-shots/${name}.png`, fullPage: true });
  console.log(`  shot: ${name} -> ${page.url()}`);
}

if (MODE === "gate") {
  console.log(`== Auth gate（${BASE}，無 bypass）==`);
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(1500);
  const ok = page.url().includes("/admin/login");
  console.log(`  /admin -> ${page.url()}  ${ok ? "PASS（已彈去 login）" : "FAIL"}`);
  await shot("/admin/login", "admin-login", 1200);
} else {
  console.log(`== 截圖（${BASE}，bypass）==`);
  await shot("/admin", "admin-dashboard", 3400);
  await shot("/admin/users", "admin-users", 2800);
  await shot("/admin/spirits", "admin-spirits", 3200);
  await shot("/admin/centres", "admin-centres", 3400);
  await shot("/admin/reports", "admin-reports", 3600);
  await shot("/admin/settings", "admin-settings", 2600);
  try {
    const res = await page.goto(`${BASE}/api/admin/users?page=1`, { waitUntil: "domcontentloaded" });
    const j = await res.json();
    const uid = j?.rows?.[0]?.userId;
    if (uid) await shot(`/admin/users/${uid}`, "admin-user-detail", 2200);
    else console.log("  (冇玩家存檔，略過用戶詳情)");
  } catch (e) {
    console.log("  用戶詳情略過:", String(e).slice(0, 80));
  }
}

await browser.close();
console.log("done");
