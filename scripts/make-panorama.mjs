// 全景天幕管線：model-pipeline/battle-bg-src/pano/<id>.png → public/battle-bg/pano/<id>.webp
//
// 同 make-battle-bg.mjs 唔同：保留寬幅原比例（唔裁成直向），俾 3D 場景做 inside-sphere skybox。
// 用法：node scripts/make-panorama.mjs [id...]（唔帶參數就處理全部）

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";

const SRC_DIR = "model-pipeline/battle-bg-src/pano";
const OUT_DIR = "public/battle-bg/pano";
// 完整球面 equirect（360°×180°）：GroundedSkybox 地面投影要求 2:1；
// 源圖係 16:9 生成圖，直接 fill 到 2:1（輕微縱向壓縮可接受）
const TARGET_W = 2048;
const TARGET_H = 1024;

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
    .resize(TARGET_W, TARGET_H, { kernel: "lanczos3", fit: "fill" })
    .webp({ quality: 82 })
    .toFile(out);
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`${id}: → ${out} (${kb}KB)`);
}
