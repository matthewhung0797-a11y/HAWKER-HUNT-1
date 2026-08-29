// 生成兩款實體 QR：①登入款（開網站）②打卡款（每個據點一個，只喺 app 內「掃碼打卡」掃描器用）
// 打卡款特登用 hawkerhunt:checkin:<id> scheme——原生相機開唔到，逼玩家喺遊戲內掃描器掃，
// 同登入款（普通網址）清楚分家。輸出去 public/qr/。
// 跑法：node scripts/gen-checkin-qr.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const DOMAIN = "https://hawker-hunt-rust.vercel.app";

// 同 src/content/centres.ts 對齊（只讀唔改本體，避免郁到其他 code）
const CENTRES = [
  { id: "maxwell", zh: "麥士威熟食中心", en: "Maxwell Food Centre" },
  { id: "chinatown-complex", zh: "牛車水大廈熟食中心", en: "Chinatown Complex" },
  { id: "old-airport-road", zh: "舊機場路熟食中心", en: "Old Airport Road" },
  { id: "tekka-centre", zh: "竹腳中心", en: "Tekka Centre" },
  { id: "lau-pa-sat", zh: "老巴剎", en: "Lau Pa Sat" },
  { id: "hk-test", zh: "錦田波地（本地測試）", en: "Kam Tin (Dev Test)" },
];

const OUT_DIR = path.resolve(process.cwd(), "public", "qr");
const W = 900;
const QR = 720;
const PAD = (W - QR) / 2;

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// QR + 底部標題條，出成一張可以直接打印嘅貼紙
async function render(payload, title, subtitle, outFile) {
  const qrPng = await QRCode.toBuffer(payload, {
    type: "png",
    width: QR,
    margin: 2,
    errorCorrectionLevel: "H", // 高糾錯：貼紙有污漬／反光都掃得返
    color: { dark: "#3a2a1a", light: "#ffffff" },
  });

  const capH = 190;
  const H = PAD + QR + capH;
  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#fdf6e8"/>
      <text x="${W / 2}" y="${PAD + QR + 66}" font-family="'Noto Sans CJK TC','Microsoft JhengHei',sans-serif" font-size="52" font-weight="800" fill="#3a2a1a" text-anchor="middle">${escapeXml(title)}</text>
      <text x="${W / 2}" y="${PAD + QR + 126}" font-family="monospace" font-size="30" fill="#8a7a5a" text-anchor="middle">${escapeXml(subtitle)}</text>
    </svg>`
  );

  const out = await sharp(svg)
    .composite([{ input: qrPng, top: PAD, left: PAD }])
    .png()
    .toBuffer();

  await writeFile(outFile, out);
  console.log(`  ✓ ${path.basename(outFile)}  →  ${payload}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("登入款（掃完開網站）：");
  await render(`${DOMAIN}/`, "Hawker Hunt · 入場", `${DOMAIN}`, path.join(OUT_DIR, "login.png"));

  console.log("\n打卡款（只喺遊戲內「掃碼打卡」掃）：");
  for (const c of CENTRES) {
    await render(
      `hawkerhunt:checkin:${c.id}`,
      `${c.zh} · 打卡`,
      `hawkerhunt:checkin:${c.id}`,
      path.join(OUT_DIR, `checkin-${c.id}.png`)
    );
  }

  console.log(`\n全部生成完，喺 ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
