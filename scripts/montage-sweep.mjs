import sharp from "sharp";
import { readdirSync } from "node:fs";

const dir = "test-shots/sweep";
const order = ["0", "+90", "180", "-90"];
const files = readdirSync(dir).filter((f) => f.endsWith(".png"));
const species = [...new Set(files.map((f) => f.replace(/-(0|\+90|180|-90)\.png$/, "")))].sort();

const CW = 300, CH = 320, LABEL = 20;
const cellW = CW, cellH = CH + LABEL, COLS = order.length;

async function cell(id, label) {
  const meta = await sharp(`${dir}/${id}-${label}.png`).metadata();
  // tight crop on the player figure (left-center foreground)
  const img = await sharp(`${dir}/${id}-${label}.png`)
    .extract({ left: Math.round(meta.width * 0.16), top: Math.round(meta.height * 0.22), width: Math.round(meta.width * 0.36), height: Math.round(meta.height * 0.62) })
    .resize(CW, CH, { fit: "contain", background: "#111" })
    .toBuffer();
  const cap = Buffer.from(`<svg width="${CW}" height="${LABEL}"><rect width="100%" height="100%" fill="#000"/><text x="4" y="15" font-family="monospace" font-size="13" fill="#8f8">${id} yaw=${label}</text></svg>`);
  return sharp({ create: { width: cellW, height: cellH, channels: 3, background: "#111" } })
    .composite([{ input: img, top: 0, left: 0 }, { input: cap, top: CH, left: 0 }])
    .png()
    .toBuffer();
}

// 4 species per sheet
const perSheet = 4;
for (let s = 0; s * perSheet < species.length; s++) {
  const grp = species.slice(s * perSheet, s * perSheet + perSheet);
  const cells = [];
  for (const id of grp) for (const y of order) cells.push(await cell(id, y));
  const rows = grp.length;
  const sheet = sharp({ create: { width: COLS * cellW, height: rows * cellH, channels: 3, background: "#111" } });
  const comp = cells.map((buf, i) => ({ input: buf, left: (i % COLS) * cellW, top: Math.floor(i / COLS) * cellH }));
  await sheet.composite(comp).png().toFile(`test-shots/sweep-sheet-${s + 1}.png`);
  console.log(`wrote sweep-sheet-${s + 1}.png (${grp.join(", ")})`);
}
