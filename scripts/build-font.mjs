/**
 * 將 jf open 粉圓（open-huninn）子集化：只保留 app 實際用到嘅字元，
 * 輸出細碼 woff2 做遊戲顯示字型。來源檔 jf-openhuninn.ttf 唔入 git。
 *
 * 掃 src/ 全部 .ts/.tsx/.json/.mjs（自動涵蓋頁面內硬編碼文案，唔再靠白名單），
 * 並剝除程式碼註解，避免收集永遠唔會顯示嘅字。
 *
 * 何時要跑：加／改任何畫面顯示文字（species、i18n、頁面硬編碼文案等）之後。
 * 唔跑就會缺字 → fallback Noto／系統字，同一個詞入面有字變粗變樣（實測商店「銅筷子」）。
 * 用法：node scripts/build-font.mjs → commit public/fonts/openhuninn-subset.woff2
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import subsetFont from "subset-font";

const SRC_ROOT = "src";

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
mkdirSync("public/fonts", { recursive: true });
writeFileSync("public/fonts/openhuninn-subset.woff2", woff2);
console.log(`output: ${Math.round(woff2.length / 1024)}KB`);
