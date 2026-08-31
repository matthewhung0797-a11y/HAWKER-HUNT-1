/**
 * 將 jf open 粉圓（open-huninn）子集化：只保留 app 實際用到嘅字元，
 * 輸出細碼 woff2 做遊戲顯示字型。來源檔 jf-openhuninn.ttf 唔入 git。
 *
 * 掃 src/ 全部 .ts/.tsx/.json/.mjs（自動涵蓋頁面內硬編碼文案，唔再靠白名單），
 * 並剝除程式碼註解，避免收集永遠唔會顯示嘅字。
 *
 * 輸出檔名帶內容雜湊（openhuninn-subset.{hash}.woff2），並自動改寫
 * globals.css 的 @font-face URL — 檔名一變，serwist Service Worker 的
 * static-font-assets（StaleWhileRevalidate, 7日）同所有 HTTP 快取即刻失效，
 * 唔會再出現「部署咗但部機仲係食緊舊字體」嘅情況。
 *
 * 何時要跑：加／改任何畫面顯示文字（species、i18n、頁面硬編碼文案等）之後。
 * 唔跑就會缺字 → fallback Noto／系統字，同一個詞入面有字變粗變樣（實測商店「銅筷子」）。
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

let text = "";
for (const file of walkSources(SRC_ROOT)) {
  let t = readFileSync(file, "utf8");
  // 剝除塊註解與行註解（保留顯示字串；「:」開頭嘅 // 如 https:// 唔會誤殺）
  t = t.replace(/\/\*[\s\S]*?\*\//g, "");
  t = t.replace(/(^|[^:'"\\A-Za-z0-9])\/\/[^\n]*/g, "$1");
  text += t;
}

// ASCII 全集 + 常用中文標點 + 全形數字符號（暱稱等動態文字由 Noto fallback 補）
for (let i = 32; i < 127; i++) text += String.fromCharCode(i);
text += "，。！？：；、（）「」『』…—・％／＋－＝×★☆０１２３４５６７８９";

const unique = [...new Set([...text])].join("");
console.log(`unique chars: ${unique.length}`);

const ttf = readFileSync("jf-openhuninn.ttf");
const woff2 = await subsetFont(ttf, unique, { targetFormat: "woff2" });

// 內容雜湊檔名 — 雜湊不變（字集無變）就重用同名檔，快取照用；一變即破快取
const hash = createHash("sha256").update(woff2).digest("hex").slice(0, 8);
const outName = `openhuninn-subset.${hash}.woff2`;
mkdirSync("public/fonts", { recursive: true });

// 清走舊嘅 subset 輸出（src/ 掃描唔會掂到 globals.css，冇死鎖風險）
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
