// Build labeled contact sheets from test-shots/facing/*.png (player side cropped + zoomed).
// Run: node scripts/montage.mjs
import sharp from "sharp";
import { readdirSync } from "node:fs";

const dir = "test-shots/facing";
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
const CW = 300, CH = 300, COLS = 4, LABEL = 22;
const cellW = CW, cellH = CH + LABEL;

const cells = [];
for (const f of files) {
  const id = f.replace(".png", "");
  // source is 900x520 @1.5 dsr => actual 1350x780; player sits left-center. crop left 55%.
  const meta = await sharp(`${dir}/${f}`).metadata();
  const cropW = Math.round(meta.width * 0.5);
  const img = await sharp(`${dir}/${f}`)
    .extract({ left: Math.round(meta.width * 0.18), top: Math.round(meta.height * 0.15), width: cropW, height: Math.round(meta.height * 0.75) })
    .resize(CW, CH, { fit: "contain", background: "#111" })
    .toBuffer();
  const label = Buffer.from(
    `<svg width="${CW}" height="${LABEL}"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-family="monospace" font-size="14" fill="#fff">${id}</text></svg>`
  );
  const cell = await sharp({ create: { width: cellW, height: cellH, channels: 3, background: "#111" } })
    .composite([{ input: img, top: 0, left: 0 }, { input: label, top: CH, left: 0 }])
    .png()
    .toBuffer();
  cells.push(cell);
}

const perSheet = COLS * 4; // 4x4 = 16 per sheet
for (let s = 0; s * perSheet < cells.length; s++) {
  const batch = cells.slice(s * perSheet, s * perSheet + perSheet);
  const rows = Math.ceil(batch.length / COLS);
  const sheet = sharp({ create: { width: COLS * cellW, height: rows * cellH, channels: 3, background: "#111" } });
  const comp = batch.map((buf, i) => ({ input: buf, left: (i % COLS) * cellW, top: Math.floor(i / COLS) * cellH }));
  await sheet.composite(comp).png().toFile(`test-shots/facing-sheet-${s + 1}.png`);
  console.log(`wrote facing-sheet-${s + 1}.png (${batch.length} cells)`);
}
