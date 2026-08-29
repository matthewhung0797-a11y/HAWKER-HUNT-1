// 生成小販中心打卡 QR Code（實體貼紙 / 印刷用）
//   PNG：public/qr/<centreId>.png，內容 https://hawkerhunt.app/c/<centreId>
//   印刷：public/qr/print-sheet.html（A4 grid，夥伴自己 print 出嚟貼）
//
// ⚠️ 夥伴唔喺實體據點現場（例如喺辦公室試印同掃）會撞 GPS 地理圍欄，
//    打卡會彈「太遠」錯誤。要繞過就去 profile 頁開 devMode（devMode 會跳過 GPS 驗證）。
//
// centre 清單由 src/content/centres.ts 讀取解析（唯一真相來源）；
// Line A 合併咗 hk-test 之後要重跑本 script 先會補到新據點。
//
// 用法：node scripts/gen-qr.mjs

import QRCode from "qrcode";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "public/qr";
// 目前 Vercel 測試域名；將來轉正式域名改呢度再重跑重印。
// app 嘅 parseQR 唔認域名（凡 http(s) /c/<id> 都認），所以舊貼紙掃入 app 照用得。
const BASE_URL = "https://hawker-hunt-rust.vercel.app/c";

// 由 centres.ts 讀 id + 中英文名。只 parse HAWKER_CENTRES 陣列範圍，
// 避免撞到 FACTIONS 等同樣有 id/name 欄位嘅其他 export。
function readCentres() {
  const src = readFileSync("src/content/centres.ts", "utf8");
  const start = src.indexOf("HAWKER_CENTRES");
  // 由 `= [` 搵陣列開括號，避免撞到型別註解 `HawkerCentre[]` 個 `[`
  const eq = src.indexOf("=", start);
  const arrOpen = src.indexOf("[", eq);
  // 由陣列開括號起計中括號平衡，搵返成個陣列 literal
  let depth = 0;
  let end = arrOpen;
  for (let i = arrOpen; i < src.length; i++) {
    const ch = src[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = src.slice(arrOpen, end + 1);

  const centres = [];
  // 逐個 centre object：id 之後跟住 name.en / name.zh
  const re =
    /id:\s*"([a-z0-9-]+)"[\s\S]*?name:\s*\{\s*en:\s*"([^"]+)"\s*,\s*zh:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    centres.push({ id: m[1], en: m[2], zh: m[3] });
  }
  return centres;
}

const centres = readCentres();
if (centres.length === 0) {
  console.error("解析唔到任何 centre，檢查 src/content/centres.ts 格式");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const generated = [];
for (const c of centres) {
  const content = `${BASE_URL}/${c.id}`;
  const file = join(OUT_DIR, `${c.id}.png`);
  await QRCode.toFile(file, content, {
    width: 800, // >=600px 要求，印刷夠清
    margin: 2,
    errorCorrectionLevel: "H", // 高糾錯，貼紙有污損都掃到
    color: { dark: "#4a2c14", light: "#f0e2c4" }, // 羊皮紙金啡主題
  });
  generated.push(file);
  console.log(`${file}  ->  ${content}  (${c.zh} / ${c.en})`);
}

// A4 印刷版：自包含 HTML，img 用相對路徑指返同 folder 嘅 PNG
const cards = centres
  .map(
    (c) => `      <figure class="card">
        <img src="${c.id}.png" alt="${c.en} QR" />
        <figcaption>
          <span class="zh">${c.zh}</span>
          <span class="en">${c.en}</span>
        </figcaption>
      </figure>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Hawker Hunt 打卡 QR 印刷版</title>
<style>
  :root { --ink: #4a2c14; --paper: #f0e2c4; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16mm 12mm;
    font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
    color: var(--ink);
    background: #fff;
  }
  h1 { font-size: 20pt; margin: 0 0 2mm; }
  p.note { font-size: 9pt; color: #7a5a38; margin: 0 0 8mm; }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10mm;
  }
  .card {
    margin: 0;
    padding: 6mm;
    border: 1.5pt dashed #b8935a;
    border-radius: 4mm;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
    background: #fffdf6;
  }
  .card img { width: 100%; max-width: 68mm; height: auto; image-rendering: pixelated; }
  figcaption { display: flex; flex-direction: column; gap: 1mm; margin-top: 4mm; }
  figcaption .zh { font-size: 15pt; font-weight: 800; }
  figcaption .en { font-size: 10pt; color: #7a5a38; }
  @page { size: A4; margin: 12mm; }
  @media print {
    body { padding: 0; }
    p.note { display: none; }
  }
</style>
</head>
<body>
  <h1>Hawker Hunt — 打卡 QR 貼紙</h1>
  <p class="note">將呢頁 print 出嚟（A4），沿虛線剪開貼喺對應據點。掃描格式：https://hawkerhunt.app/c/&lt;centreId&gt;</p>
  <div class="grid">
${cards}
  </div>
</body>
</html>
`;

const sheet = join(OUT_DIR, "print-sheet.html");
writeFileSync(sheet, html, "utf8");
generated.push(sheet);
console.log(`${sheet}  (${centres.length} 個據點印刷版)`);

console.log(`\n完成：共 ${generated.length} 個檔案`);
