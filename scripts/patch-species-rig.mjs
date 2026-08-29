// 按 rig mode 更新 species.ts 旗標（唔改其他欄）
// 用法：node scripts/patch-species-rig.mjs meshy:id1,id2 tripo:id3
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
/** @type {Record<string, "meshy"|"tripo">} */
const map = {};
for (const a of args) {
  const [mode, list] = a.split(":");
  if (!mode || !list) continue;
  for (const id of list.split(",").filter(Boolean)) map[id] = mode;
}
if (!Object.keys(map).length) {
  console.error("usage: node scripts/patch-species-rig.mjs meshy:a,b tripo:c");
  process.exit(1);
}

let src = readFileSync("src/content/species.ts", "utf8");
const note = `// HQ remake ${new Date().toISOString().slice(0, 10)}：`;

for (const [id, mode] of Object.entries(map)) {
  const re = new RegExp(
    `(id: "${id}",[\\s\\S]*?modelUrl: "/models/${id}\\.glb",)([\\s\\S]*?)(\\n  \\},)`,
  );
  const m = src.match(re);
  if (!m) {
    console.warn(`skip ${id}: block not found`);
    continue;
  }
  let block = m[0];
  // 清舊 rig／yaw／HQ 註解行（保留 modelHeightM）
  block = block.replace(/\n\s*\/\/[^\n]*(?:HQ remake|yaw sweep|Meshy pre|facing-lock)[^\n]*/g, "");
  block = block.replace(/\n\s*rigLite:\s*true,/g, "");
  block = block.replace(/\n\s*modelYaw:\s*[^,\n]+,/g, "");
  // 確保 animated: true
  if (!/animated:\s*true/.test(block)) {
    block = block.replace(/(modelUrl: "[^"]+",)/, `$1\n    animated: true,`);
  }
  const insert =
    mode === "meshy"
      ? `\n    ${note}Tripo→Meshy fullRig（modelYaw 待 facing-lock）\n    modelYaw: Math.PI / 2,`
      : `\n    ${note}Tripo rigLite（Meshy 422）\n    rigLite: true,\n    modelYaw: -Math.PI / 2,`;
  // 插喺 modelHeightM 前；若冇 height 就插喺 animated 後
  if (/modelHeightM:/.test(block)) {
    block = block.replace(/(\n\s*modelHeightM:)/, `${insert}$1`);
  } else {
    block = block.replace(/(animated:\s*true,)/, `$1${insert}`);
  }
  src = src.replace(m[0], block);
  console.log(`patched ${id} → ${mode}`);
}
writeFileSync("src/content/species.ts", src);
console.log("DONE");
