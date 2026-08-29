// 將生成嘅精靈原圖裁切成正方形 webp icon，輸出到 public/spirits/
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "C:/Users/user/.cursor/projects/c-Users-user-hawker-hunt/assets";
const OUT = "public/spirits";
mkdirSync(OUT, { recursive: true });
mkdirSync("public/images", { recursive: true });

// 有 CLI 參數就只處理指定 id（新精靈增量，唔重寫現有），冇就行全份預設名單＋hero
const DEFAULT_SPIRITS = [
  "oily-rice-chick",
  "silky-chicken-warrior",
  "hainan-chicken-god",
  "little-laksa",
  "laksa-warrior",
  "laksa-dragon",
  "bkt-cub",
  "bkt-warrior",
  "bkt-grandmaster",
  "tutu-sprite",
  "lapis-queen",
  "pastry-queen",
  "kaya-blob",
  "kaya-warrior",
  "kaya-dragon",
];

// --from-full：改由 public/spirits/full/{id}.webp（透明底）合成 cream 底 icon。
// 原圖唔係 cream 底（例如白色精靈要配藍底先去到背）嘅精靈必須行呢個模式。
const fromFull = process.argv.includes("--from-full");
const cliIds = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const incremental = cliIds.length > 0;
const SPIRITS = incremental ? cliIds : DEFAULT_SPIRITS;

for (const id of SPIRITS) {
  const src = fromFull ? `public/spirits/full/${id}.webp` : join(ASSETS, `${id}.png`);
  // trim 走 cream 邊框，再 pad 成正方形（同色底），縮到 512
  const trimmed = await sharp(src).trim({ threshold: 18 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const size = Math.max(meta.width, meta.height);
  const pad = Math.round(size * 0.07);
  // 注意：sharp 內部管線 resize 行先過 extend，唔可以同一條 chain 齊用（會出非正方形），
  // 所以先 pad 成正方形出 buffer，再另開一條 chain 縮到 512
  const padded = await sharp(trimmed)
    .extend({
      top: Math.floor((size - meta.height) / 2) + pad,
      bottom: Math.ceil((size - meta.height) / 2) + pad,
      left: Math.floor((size - meta.width) / 2) + pad,
      right: Math.ceil((size - meta.width) / 2) + pad,
      background: "#F2E7CF",
    })
    .flatten({ background: "#F2E7CF" })
    .toBuffer();
  await sharp(padded).resize(512, 512).webp({ quality: 82 }).toFile(join(OUT, `${id}.webp`));
  console.log(`ok ${id}`);
}

if (!incremental) {
  await sharp(join(ASSETS, "hero-hawker-night.png"))
    .resize(1080, null)
    .webp({ quality: 72 })
    .toFile("public/images/hero-hawker-night.webp");
  console.log("ok hero");
}
