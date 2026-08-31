const QRCode = require("qrcode");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const centres = [
  ["maxwell", "麥士威熟食中心", "Maxwell Food Centre"],
  ["chinatown-complex", "牛車水大廈熟食中心", "Chinatown Complex Food Centre"],
  ["old-airport-road", "舊機場路熟食中心", "Old Airport Road Food Centre"],
  ["tekka-centre", "竹腳中心", "Tekka Centre"],
  ["lau-pa-sat", "老巴剎", "Lau Pa Sat"],
  ["hk-test", "錦田波地遊樂場（測試）", "Kam Tin Po Tei Playground (Dev)"],
  ["hk-yuen-kong", "元崗村", "Yuen Kong Village"],
];

const out = path.join(__dirname, "qr-codes");
if (!fs.existsSync(out)) fs.mkdirSync(out);
const outEn = path.join(__dirname, "qr-codes-en");
if (!fs.existsSync(outEn)) fs.mkdirSync(outEn);

async function generate(id, name, dir, font, size) {
  const url = "https://hawker-hunt-seven.vercel.app/c/" + id;
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "H",
  });
  const qrBase64 = qrDataUrl.split(",")[1];
  const svg =
    '<svg width="1024" height="1200" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="1024" height="1200" fill="white"/>' +
    '<image x="0" y="0" width="1024" height="1024" href="data:image/png;base64,' + qrBase64 + '"/>' +
    '<text x="512" y="1130" font-family="' + font + '" font-size="' + size + '" font-weight="bold" fill="black" text-anchor="middle">' + name + "</text>" +
    "</svg>";
  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, id + ".png"));
  console.log(dir + "/" + id + ".png done");
}

async function main() {
  for (const [id, zh, en] of centres) {
    await generate(id, zh, out, "Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif", 72);
    await generate(id, en, outEn, "Arial, Helvetica, sans-serif", 64);
  }
  console.log("All " + centres.length + " QR codes generated in both languages");
}

main().catch(console.error);
