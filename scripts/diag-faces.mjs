// Line B 臉部畸變批量診斷：對全部有 3D 模型嘅精靈影 idle + attack 截圖，
// 用 sharp 自動偵測角色剪影（排除背景色 + gridHelper 金/棕線），裁出放大頭部區域，
// 再拼成 montage 方便肉眼逐隻檢查臉。
//
// 用法：node scripts/diag-faces.mjs [id1,id2,...]   （唔傳就跑全部 53 隻）
// 輸出：test-shots/faces/{id}-{anim}.png（全圖）、crop-{id}-{anim}.png（頭部放大）、
//       montage-idle-*.png / montage-attack-*.png（拼圖）

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";

// species.ts 入面所有有 modelUrl 嘅 id（順序 = 系列順序）
const ALL = [
  "oily-rice-chick", "silky-chicken-warrior", "hainan-chicken-god",
  "little-laksa", "laksa-warrior", "laksa-dragon",
  "bkt-cub", "bkt-warrior", "bkt-grandmaster",
  "tutu-sprite", "lapis-queen", "pastry-queen",
  "kaya-blob", "kaya-warrior", "kaya-dragon",
  "chilli-crablet", "crab-claw-warrior", "chilli-crab-king",
  "satay-skewerling", "satay-warrior", "satay-flame-emperor",
  "kopi-bean", "kopi-sock-warrior", "kopi-o-emperor",
  "radish-cubie", "carrot-cake-warrior", "black-white-cake-king",
  "rojak-tot", "rojak-warrior", "rojak-king",
  "little-orh-luak", "omelette-warrior", "oyster-immortal",
  "kway-teow-kid", "kway-teow-warrior", "wok-hei-god",
  "curry-puffling", "curry-puff-warrior", "golden-puff-sovereign",
  "prata-pup", "prata-warrior", "prata-sky-elephant",
  "chendol-jelly", "chendol-warrior", "chendol-snow-queen",
  "chilli-baby", "garlic-guard", "lemongrass-swordsman", "riceball-baby",
  "vermicelli-sprite", "egg-guard", "shrimp-hopper", "coconut-jelly",
];

const ids = process.argv[2] ? process.argv[2].split(",") : ALL;
const anims = ["idle", "attack"];
const W = 480, H = 480;
const OUT = "test-shots/faces";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// 背景 #2a1a0c、grid 金 #c9a227、grid 棕 #6b4a2a、軸線 R/G/B
const EXCLUDE = [
  [42, 26, 12],   // bg
  [201, 162, 39], // grid 金
  [107, 74, 42],  // grid 棕
];
const near = (r, g, b, [tr, tg, tb], tol) =>
  Math.abs(r - tr) <= tol && Math.abs(g - tg) <= tol && Math.abs(b - tb) <= tol;
// 軸線係高飽和純紅/綠/藍
const isAxis = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx > 120 && mn < 70 && (mx - mn) > 90 &&
    ((r === mx && g < 90 && b < 90) || (g === mx && r < 120 && b < 120) || (b === mx && r < 90 && g < 90));
};

// 由 raw RGBA 搵角色 bbox（限中央 76% 闊度，排除側邊 grid），再裁頭部區域
async function cropHead(buf, id, anim) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const x0b = Math.floor(w * 0.12), x1b = Math.ceil(w * 0.88);
  // 前景遮罩（排除 bg / grid 色 / 軸線）
  const fg = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const o = (y * w + x) * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    if (isAxis(r, g, b)) return false;
    for (const c of EXCLUDE) if (near(r, g, b, c, 26)) return false;
    return true;
  };
  let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = x0b; x < x1b; x++) {
      // run-filter：要求水平同垂直方向都有鄰接前景，剷走 1px grid/軸線同散點
      if (!fg(x, y) || !fg(x - 2, y) || !fg(x + 2, y) || !fg(x, y - 2) || !fg(x, y + 2)) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const outPath = `${OUT}/crop-${id}-${anim}.png`;
  if (count < 50 || maxX <= minX || maxY <= minY) {
    // 偵測唔到（可能全圖太細）：直接放大中央上部
    await sharp(buf).extract({ left: 96, top: 24, width: 288, height: 240 })
      .resize(320, 267).png().toFile(outPath);
    return outPath;
  }
  const bw = maxX - minX, bh = maxY - minY;
  // 頭部 = bbox 上方約 52%，兩側各留少少 margin
  const padX = Math.round(bw * 0.12);
  let cropL = Math.max(0, minX - padX);
  let cropR = Math.min(w, maxX + padX);
  let cropT = Math.max(0, minY - Math.round(bh * 0.04));
  let cropH = Math.max(24, Math.round(bh * 0.55));
  if (cropT + cropH > h) cropH = h - cropT;
  const cropW = cropR - cropL;
  await sharp(buf).extract({ left: cropL, top: cropT, width: cropW, height: cropH })
    .resize({ width: 300, height: 300, fit: "inside" }).png().toFile(outPath);
  return outPath;
}

function label(text, w = 300, h = 22) {
  const svg = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#111"/><text x="6" y="16" font-family="monospace" font-size="14" fill="#fff">${text}</text></svg>`;
  return Buffer.from(svg);
}

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => console.log(`[pageerror ${e.message.slice(0, 120)}]`));

const cropPaths = { idle: [], attack: [] };
for (const id of ids) {
  for (const anim of anims) {
    try {
      await page.goto(`http://localhost:3000/dev/model?species=${id}&anim=${anim}`, { waitUntil: "networkidle", timeout: 30000 });
      // 隱藏 dev 頁 DOM overlay 標籤（白字污染剪影偵測）
      await page.addStyleTag({ content: ".absolute{display:none !important}" });
      await page.waitForTimeout(anim === "attack" ? 900 : 2400);
      const buf = await page.screenshot();
      await sharp(buf).png().toFile(`${OUT}/${id}-${anim}.png`);
      const cp = await cropHead(buf, id, anim);
      cropPaths[anim].push({ id, cp });
      console.log(`ok ${id} ${anim}`);
    } catch (e) {
      console.log(`FAIL ${id} ${anim}: ${e.message.slice(0, 100)}`);
    }
  }
}
await browser.close();

// 拼 montage：每張 sheet 最多 5 列 × N 行
async function montage(items, name) {
  const cols = 5;
  const cellW = 300, cellH = 300, labH = 22;
  const rows = Math.ceil(items.length / cols);
  const perSheet = 15; // 5×3
  let sheet = 0;
  for (let start = 0; start < items.length; start += perSheet) {
    const chunk = items.slice(start, start + perSheet);
    const r = Math.ceil(chunk.length / cols);
    const canvasW = cols * cellW;
    const canvasH = r * (cellH + labH);
    const composites = [];
    for (let i = 0; i < chunk.length; i++) {
      const cx = (i % cols) * cellW;
      const cy = Math.floor(i / cols) * (cellH + labH);
      const img = await sharp(chunk[i].cp).resize({ width: cellW, height: cellH, fit: "contain", background: "#222" }).png().toBuffer();
      composites.push({ input: label(chunk[i].id, cellW, labH), left: cx, top: cy });
      composites.push({ input: img, left: cx, top: cy + labH });
    }
    const outName = `${OUT}/montage-${name}-${sheet}.png`;
    await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: "#222" } })
      .composite(composites).png().toFile(outName);
    console.log(`montage → ${outName}`);
    sheet++;
  }
}
await montage(cropPaths.idle, "idle");
await montage(cropPaths.attack, "attack");
console.log("DONE");
