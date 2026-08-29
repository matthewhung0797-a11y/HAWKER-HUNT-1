// 戰鬥背景管線：model-pipeline/battle-bg-src/<centreId>.png → public/models 同級 public/battle-bg/<centreId>.webp
//
// 用法：node scripts/make-battle-bg.mjs [centreId...]（唔帶參數就處理全部）

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";

const SRC_DIR = "model-pipeline/battle-bg-src";
const OUT_DIR = "public/battle-bg";
// 手機直向全屏：1080×1920 夠晒清，WebP q80 大約 150–300KB
const TARGET_W = 1080;
const TARGET_H = 1920;

mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const ids = args.length
  ? args
  : readdirSync(SRC_DIR)
      .filter((f) => f.endsWith(".png"))
      .map((f) => basename(f, ".png"));

for (const id of ids) {
  const src = join(SRC_DIR, `${id}.png`);
  if (!existsSync(src)) {
    console.warn(`${id}: 搵唔到 ${src}，跳過`);
    continue;
  }
  const out = join(OUT_DIR, `${id}.webp`);
  await sharp(src)
    .resize(TARGET_W, TARGET_H, { fit: "cover", position: "centre", kernel: "lanczos3" })
    .webp({ quality: 80 })
    .toFile(out);
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`${id}: → ${out} (${kb}KB)`);
}
