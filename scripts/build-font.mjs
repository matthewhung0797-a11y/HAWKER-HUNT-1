/**
 * 將 jf open 粉圓（open-huninn）子集化：只保留 app 實際用到嘅字元，
 * 輸出細碼 woff2 做遊戲顯示字型。來源檔 jf-openhuninn.ttf 唔入 git。
 *
 * 何時要跑：加／改 species 中文名、i18n 文案、centres／items／badges 顯示字之後。
 * 唔跑就會缺字 → fallback Noto／系統字，同一個詞入面有字變粗變樣（實測「咖喱卜」、徽章牆）。
 * 用法：node scripts/build-font.mjs → commit public/fonts/openhuninn-subset.woff2
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import subsetFont from "subset-font";

const SOURCES = [
  "src/i18n/messages/zh.json",
  "src/i18n/messages/en.json",
  "src/content/species.ts",
  "src/content/centres.ts",
  "src/content/items.ts",
  "src/content/elements.ts",
  "src/content/badges.ts",
];

let text = "";
for (const f of SOURCES) text += readFileSync(f, "utf8");

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
