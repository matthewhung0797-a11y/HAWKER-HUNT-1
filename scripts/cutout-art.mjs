// 由邊緣 flood-fill 移除 cream 背景，輸出透明底全身精靈圖 public/spirits/full/{id}.webp
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "C:/Users/user/.cursor/projects/c-Users-user-hawker-hunt/assets";
const OUT = "public/spirits/full";
mkdirSync(OUT, { recursive: true });

// 有 CLI 參數就只處理指定 id（新精靈增量去背，唔重寫現有），冇就行全份預設名單
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
  // 原材料層（basic）
  "chilli-baby",
  "garlic-guard",
  "lemongrass-swordsman",
  "riceball-baby",
  "vermicelli-sprite",
  "egg-guard",
  "shrimp-hopper",
  "coconut-jelly",
];

const SPIRITS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SPIRITS;

const TOL = 13; // 色差容忍（每通道）；太高會蝕入白色/米色身體

function close(data, i, r, g, b) {
  return (
    Math.abs(data[i] - r) <= TOL &&
    Math.abs(data[i + 1] - g) <= TOL &&
    Math.abs(data[i + 2] - b) <= TOL
  );
}

for (const id of SPIRITS) {
  const src = join(ASSETS, `${id}.png`);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // 以四角平均色作為背景參考色
  const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, o) => s + data[o + c], 0) / 4));

  const visited = new Uint8Array(W * H);
  const queue = [];
  for (let x = 0; x < W; x++) {
    queue.push(x, (H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    queue.push(y * W, y * W + W - 1);
  }
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

  // 邊緣羽化：透明鄰接嘅不透明 pixel 降 alpha，柔化 halo
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

  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 10 })
    .resize({ width: 640, height: 640, fit: "inside" })
    .webp({ quality: 84 })
    .toFile(join(OUT, `${id}.webp`));
  console.log(`ok ${id}`);
}
