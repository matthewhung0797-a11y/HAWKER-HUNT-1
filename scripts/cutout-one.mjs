// 一次性去背：用法 node scripts/cutout-one.mjs <src.png> <out.webp> [tolerance]
// 適用於特登用對比色背景生成嘅圖（例如白色精靈配藍底）
import sharp from "sharp";

const [src, out, tolArg] = process.argv.slice(2);
const TOL = Number(tolArg ?? 34);

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, o) => s + data[o + c], 0) / 4));
const close = (i) =>
  Math.abs(data[i] - bg[0]) <= TOL && Math.abs(data[i + 1] - bg[1]) <= TOL && Math.abs(data[i + 2] - bg[2]) <= TOL;

const visited = new Uint8Array(W * H);
const queue = [];
for (let x = 0; x < W; x++) queue.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) queue.push(y * W, y * W + W - 1);
while (queue.length) {
  const p = queue.pop();
  if (visited[p]) continue;
  visited[p] = 1;
  if (!close(p * 4)) continue;
  data[p * 4 + 3] = 0;
  const x = p % W;
  const y = (p / W) | 0;
  if (x > 0) queue.push(p - 1);
  if (x < W - 1) queue.push(p + 1);
  if (y > 0) queue.push(p - W);
  if (y < H - 1) queue.push(p + W);
}

// 邊緣羽化
const alphaCopy = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) alphaCopy[p] = data[p * 4 + 3];
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    if (alphaCopy[p] === 0) continue;
    if (alphaCopy[p - 1] === 0 || alphaCopy[p + 1] === 0 || alphaCopy[p - W] === 0 || alphaCopy[p + W] === 0) {
      data[p * 4 + 3] = 140;
    }
  }
}

await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .trim({ threshold: 10 })
  .resize({ width: 640, height: 640, fit: "inside" })
  .webp({ quality: 84 })
  .toFile(out);
console.log(`ok ${out}`);
