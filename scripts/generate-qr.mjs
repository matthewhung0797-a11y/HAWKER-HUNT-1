// 生成 5 個據點嘅打卡 QR Code PNG（實體貼紙 / 測試用）
// 用法: node scripts/generate-qr.mjs
import QRCode from "qrcode";
import { mkdirSync } from "node:fs";

const CENTRES = [
  ["maxwell", "Maxwell Food Centre 麥士威熟食中心"],
  ["chinatown-complex", "Chinatown Complex 牛車水大廈熟食中心"],
  ["old-airport-road", "Old Airport Road 舊機場路熟食中心"],
  ["tekka-centre", "Tekka Centre 竹腳中心"],
  ["lau-pa-sat", "Lau Pa Sat 老巴剎"],
];

mkdirSync("qr-codes", { recursive: true });

for (const [id, name] of CENTRES) {
  const content = `https://hawkerhunt.app/c/${id}`;
  const file = `qr-codes/${id}.png`;
  await QRCode.toFile(file, content, {
    width: 800,
    margin: 2,
    color: { dark: "#4a2c14", light: "#f0e2c4" },
  });
  console.log(`${file}  ->  ${content}  (${name})`);
}
