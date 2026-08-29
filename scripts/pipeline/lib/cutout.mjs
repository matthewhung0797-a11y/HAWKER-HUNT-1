// 系統二：四角 flood-fill 去背 helper（由 scripts/cutout-art.mjs 抽出、通用化）。
// 食 buffer 或路徑 → 輸出 640×640 透明底 webp。用喺 pipeline art stage 去背生成圖。
// 生成 prompt 已要求單一純色平底、四邊留空——去背成功率靠呢個前提。

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TOL = 13; // 色差容忍（每通道）；太高會蝕入白色/米色身體（同 cutout-art.mjs 一致）

function close(data, i, r, g, b) {
  return Math.abs(data[i] - r) <= TOL && Math.abs(data[i + 1] - g) <= TOL && Math.abs(data[i + 2] - b) <= TOL;
}

/**
 * 去背 → 640×640 透明 webp。
 * @param input Buffer 或檔案路徑
 * @param outPath 輸出 webp 路徑
 */
export async function cutoutToWebp(input, outPath) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // 四角平均色作背景參考
  const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, o) => s + data[o + c], 0) / 4));

  const visited = new Uint8Array(W * H);
  const queue = [];
  for (let x = 0; x < W; x++) queue.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) queue.push(y * W, y * W + W - 1);
  while (queue.length) {
    const p = queue.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (!close(data, i, bg[0], bg[1], bg[2])) continue;
    data[i + 3] = 0;
    const x = p % W;
    const y = (p / W) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < W - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - W);
    if (y < H - 1) queue.push(p + W);
  }

  // 全域背景色清除：flood-fill 入唔到嘅封閉背景格（例如光環／翼／武器同身體圍出嘅窿）
  // 都要清——背景色同角色主色有對比（prompt 已保證），TOL 13 咁緊唔會蝕入本體
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (data[i + 3] !== 0 && close(data, i, bg[0], bg[1], bg[2])) data[i + 3] = 0;
  }

  // 邊緣羽化：柔化 halo
  const alphaCopy = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) alphaCopy[p] = data[p * 4 + 3];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (alphaCopy[p] === 0) continue;
      const n = alphaCopy[p - 1] === 0 || alphaCopy[p + 1] === 0 || alphaCopy[p - W] === 0 || alphaCopy[p + W] === 0;
      if (n) data[p * 4 + 3] = 140;
    }
  }

  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 10 })
    .resize({ width: 640, height: 640, fit: "inside" })
    .webp({ quality: 84 })
    .toFile(outPath);
  return outPath;
}

const CREAM = "#F2E7CF"; // 圖鑑 icon 底色（同 SpiritIcon 卡片底一致）

/**
 * 由透明底全身 webp 合成 cream 底正方形 icon（512×512）→ public/spirits/<id>.webp。
 * 對齊 scripts/process-art.mjs --from-full 邏輯：圖鑑（SpiritIcon）已捕獲讀嘅係呢個路徑，
 * 唔生成就會 404 爛圖（同 /spirits/full/<id>.webp 係兩個唔同檔）。
 * @param fullWebp 透明底全身圖路徑（cutoutToWebp 嘅產物）
 * @param outPath  輸出 icon 路徑（例如 public/spirits/<id>.webp）
 */
export async function iconFromFullWebp(fullWebp, outPath) {
  const trimmed = await sharp(fullWebp).trim({ threshold: 18 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const size = Math.max(meta.width, meta.height);
  const pad = Math.round(size * 0.07);
  const padded = await sharp(trimmed)
    .extend({
      top: Math.floor((size - meta.height) / 2) + pad,
      bottom: Math.ceil((size - meta.height) / 2) + pad,
      left: Math.floor((size - meta.width) / 2) + pad,
      right: Math.ceil((size - meta.width) / 2) + pad,
      background: CREAM,
    })
    .flatten({ background: CREAM })
    .toBuffer();
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(padded).resize(512, 512).webp({ quality: 82 }).toFile(outPath);
  return outPath;
}
