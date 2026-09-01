/**
 * 將 jf open 粉圓（open-huninn）子集化做遊戲顯示字型。來源檔 jf-openhuninn.ttf 唔入 git。
 *
 * 字元集 = src/ 全部 .ts/.tsx/.json/.mjs 顯示字（剝註解）
 *        + 來源字型 cmap 內全部漢字（U+3400-9FFF / 相容區 / 擴展B）
 *
 * 點解要全漢字：玩家改名/後台任務標題/通知都係動態文字，字集冇可能預知；
 * 漏咗嘅字會 fallback Noto Sans TC 令同一個名粗細混雜。全漢字 ~2MB，
 * 一次過下載後由 Service Worker 快取（hash 檔名永久有效），一勞永逸。
 *
 * 輸出檔名帶內容雜湊（openhuninn-subset.{hash}.woff2），並自動改寫
 * globals.css 的 @font-face URL — 檔名一變，serwist Service Worker 的
 * static-font-assets（StaleWhileRevalidate, 7日）同所有 HTTP 快取即刻失效。
 *
 * 用法：node scripts/build-font.mjs → commit public/fonts/openhuninn-subset.*.woff2 + globals.css
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import subsetFont from "subset-font";

const SRC_ROOT = "src";
const CSS_FILE = "src/app/globals.css";

function walkSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSources(p));
    else if (/\.(ts|tsx|json|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** 解 TTF cmap（format 12 優先，退 format 4），回傳全部覆蓋碼位 */
function cmapChars(ttf) {
  const dv = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const numTables = dv.getUint16(4);
  let cmapOff = -1;
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
    if (tag === "cmap") { cmapOff = dv.getUint32(p + 8); break; }
  }
  const subCount = dv.getUint16(cmapOff + 2);
  let f12 = -1, f4 = -1;
  for (let i = 0; i < subCount; i++) {
    const p = cmapOff + 4 + i * 8;
    const off = dv.getUint32(p + 4);
    const fmt = dv.getUint16(cmapOff + off);
    if (fmt === 12 && f12 < 0) f12 = cmapOff + off;
    if (fmt === 4 && f4 < 0) f4 = cmapOff + off;
  }
  const chars = [];
  if (f12 >= 0) {
    const nGroups = dv.getUint32(f12 + 12);
    for (let g = 0; g < nGroups; g++) {
      const p = f12 + 16 + g * 12;
      const s = dv.getUint32(p), e = dv.getUint32(p + 4);
      for (let c = s; c <= e && c <= 0x2ffff; c++) chars.push(c);
    }
  } else if (f4 >= 0) {
    const segCountX2 = dv.getUint16(f4 + 6);
    const segCount = segCountX2 / 2;
    const endBase = f4 + 14, startBase = endBase + segCountX2 + 2;
    for (let s = 0; s < segCount; s++) {
      const end = dv.getUint16(endBase + s * 2), start = dv.getUint16(startBase + s * 2);
      if (end === 0xffff) continue;
      for (let c = start; c <= end; c++) chars.push(c);
    }
  }
  return chars;
}

let text = "";
for (const file of walkSources(SRC_ROOT)) {
  let t = readFileSync(file, "utf8");
  // 剝除塊註解與行註解（保留顯示字串；「:」開頭嘅 // 如 https:// 唔會誤殺）
  t = t.replace(/\/\*[\s\S]*?\*\//g, "");
  t = t.replace(/(^|[^:'"\\A-Za-z0-9])\/\/[^\n]*/g, "$1");
  text += t;
}

// ASCII 全集 + 常用中文標點 + 全形數字符號
for (let i = 32; i < 127; i++) text += String.fromCharCode(i);
text += "，。！？：；、（）「」『』…—・％／＋－＝×★☆０１２３４５６７８９";

const ttf = readFileSync("jf-openhuninn.ttf");

// 全漢字：動態文字（暱稱/後台任務標題/通知）不可預知，直接收齊字型全部漢字
const isHan = (c) =>
  (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0x20000 && c <= 0x2ffff);
const han = cmapChars(ttf).filter(isHan);
text += String.fromCodePoint(...han);

const unique = [...new Set([...text])].join("");
console.log(`unique chars: ${unique.length} (han: ${han.length})`);

const woff2 = await subsetFont(ttf, unique, { targetFormat: "woff2" });

// 內容雜湊檔名 — 雜湊不變（字集無變）就重用同名檔，快取照用；一變即破快取
const hash = createHash("sha256").update(woff2).digest("hex").slice(0, 8);
const outName = `openhuninn-subset.${hash}.woff2`;
mkdirSync("public/fonts", { recursive: true });

// 清走舊嘅 subset 輸出
for (const f of readdirSync("public/fonts")) {
  if (/^openhuninn-subset\..*\.woff2$/.test(f) && f !== outName) {
    unlinkSync(join("public/fonts", f));
    console.log(`removed old: ${f}`);
  }
}

writeFileSync(`public/fonts/${outName}`, woff2);
console.log(`output: public/fonts/${outName} (${Math.round(woff2.length / 1024)}KB)`);

// 改寫 globals.css @font-face URL（Node writeFileSync utf8 冇 BOM，唔會搞冧中文註解）
const fontUrl = `/fonts/${outName}`;
let css = readFileSync(CSS_FILE, "utf8");
const before = css;
css = css.replace(/url\("\/fonts\/openhuninn-subset[^"]*\.woff2"\)/, `url("${fontUrl}")`);
if (css === before) {
  console.error("ERROR: @font-face url not found / not updated in globals.css");
  process.exit(1);
}
writeFileSync(CSS_FILE, css, "utf8");
console.log(`globals.css @font-face → ${fontUrl}`);
