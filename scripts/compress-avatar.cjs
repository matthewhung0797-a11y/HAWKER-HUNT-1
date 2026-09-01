// 壓縮 player-avatar.glb：3 張 2048 PNG 貼圖 → 1024 WebP，幾何不動。
// （CLI optimize 對此檔 ICC profile 報 colourspace 錯，改手動 API 處理。）
const fs = require("fs");
const { NodeIO } = require("@gltf-transform/core");
const sharp = require("sharp");

(async () => {
  const io = new NodeIO();
  const doc = await io.read("public/models/player-avatar.tmp.glb");
  const root = doc.getRoot();

  for (const tex of root.listTextures()) {
    const name = tex.getName() || "?";
    const mime = tex.getMimeType();
    const bytes = tex.getImage();
    if (!bytes || !mime.includes("png")) {
      console.log(`skip ${name} (${mime})`);
      continue;
    }
    const isNormal = name.includes("normal");
    const out = await sharp(Buffer.from(bytes), { failOn: "none" })
      .toColorspace("srgb")
      .resize(1024, 1024, { fit: "inside" })
      .webp({ quality: isNormal ? 92 : 85, effort: 5 })
      .toBuffer();
    tex.setImage(new Uint8Array(out));
    tex.setMimeType("image/webp");
    console.log(`${name}: ${(bytes.length / 1048576).toFixed(2)}MB → ${(out.length / 1024).toFixed(0)}KB (webp 1024)`);
  }

  io.write("public/models/player-avatar.opt.glb", doc);
  const s = fs.statSync("public/models/player-avatar.opt.glb").size;
  console.log(`output: ${(s / 1048576).toFixed(2)}MB`);
})();
