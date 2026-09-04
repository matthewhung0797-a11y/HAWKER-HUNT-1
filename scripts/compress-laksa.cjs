// 壓縮 laksa 系列 idle GLB（CLI optimize 對 PNG ICC profile 報 colourspace 錯，
// 改用 NodeIO API + sharp 手動轉 WebP — 跟 player-avatar 壓縮同一套做法）
const fs = require("fs");
const { NodeIO } = require("@gltf-transform/core");
const { prune } = require("@gltf-transform/functions");
const sharp = require("sharp");

const files = [
  "public/models/little-laksa-idle.glb",
  "public/models/laksa-dragon-idle.glb",
];

(async () => {
  const io = new NodeIO();
  for (const f of files) {
    console.log("=== " + f + " ===");
    const before = fs.statSync(f).size;
    const doc = await io.read(f);
    for (const tex of doc.getRoot().listTextures()) {
      const mime = tex.getMimeType();
      const name = tex.getName() || "?";
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
      console.log(`${name}: ${(bytes.length / 1048576).toFixed(2)}MB → ${(out.length / 1024).toFixed(0)}KB`);
    }
    await doc.transform(prune());
    await io.write(f, doc);
    const after = fs.statSync(f).size;
    console.log(`${f}: ${(before / 1048576).toFixed(2)}MB → ${(after / 1048576).toFixed(2)}MB`);
  }
})();
