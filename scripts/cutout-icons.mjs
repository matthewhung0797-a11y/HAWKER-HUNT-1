/**
 * 自家手繪 UI icon 去背：由邊緣 flood-fill 移除純白背景，
 * 邊緣羽化後壓成 128px webp → public/ui/{name}.webp
 */
import sharp from "sharp";
import { mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const ASSETS = "C:/Users/user/.cursor/projects/c-Users-user-hawker-hunt/assets";
const OUT = "public/ui";
mkdirSync(OUT, { recursive: true });

const TOL = 18; // 白底容忍度（每通道）；outline 夠深所以唔會蝕入圖形

const files = readdirSync(ASSETS).filter((f) => f.startsWith("ic-") && f.endsWith(".png"));

function close(data, i, r, g, b) {
  return (
    Math.abs(data[i] - r) <= TOL &&
    Math.abs(data[i + 1] - g) <= TOL &&
    Math.abs(data[i + 2] - b) <= TOL
  );
}

for (const file of files) {
  const name = basename(file, ".png").replace(/^ic-/, "");
  const { data, info } = await sharp(join(ASSETS, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

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

  // 邊緣羽化，柔化白邊 halo
  const alphaCopy = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) alphaCopy[p] = data[p * 4 + 3];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (alphaCopy[p] === 0) continue;
      const n =
        alphaCopy[p - 1] === 0 || alphaCopy[p + 1] === 0 || alphaCopy[p - W] === 0 || alphaCopy[p + W] === 0;
      if (n) data[p * 4 + 3] = 120;
    }
  }

  const webp = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 12 })
    .resize({ width: 128, height: 128, fit: "inside" })
    .webp({ quality: 88 })
    .toBuffer();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(OUT, `${name}.webp`), webp);
  console.log(`ok ${name} (${Math.round(webp.length / 1024)}KB)`);
}
console.log(`done: ${files.length} icons`);
