// Audit every GLB referenced by species.ts by parsing the GLB JSON chunk directly
// (no texture decode): reports animation clips + skins (skeleton) + joints.
// Cross-references species flags (animated / rigLite / modelYaw). Run: node scripts/audit-models.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(path.join(root, "src/content/species.ts"), "utf8");

/** Parse the JSON chunk out of a .glb (binary glTF) */
function readGlbJson(file) {
  const buf = readFileSync(file);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("not a glb");
  // header 12 bytes; first chunk: length(4) type(4) data
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) throw new Error("first chunk not JSON");
  const json = buf.slice(20, 20 + chunkLen).toString("utf8");
  return JSON.parse(json);
}

// map each /models/*.glb -> species flags in the window following its modelUrl
const urlRe = /modelUrl:\s*"\/models\/([a-z0-9-]+\.glb)"/g;
const hits = [];
let m;
while ((m = urlRe.exec(src))) hits.push({ file: m[1], idx: m.index });

function fieldNear(startIdx, endIdx, name) {
  const chunk = src.slice(startIdx, endIdx);
  const rx = new RegExp("\\b" + name + "\\s*:\\s*([^,\\n}]+)");
  const mm = rx.exec(chunk);
  return mm ? mm[1].trim() : undefined;
}

const results = [];
for (let i = 0; i < hits.length; i++) {
  const cur = hits[i];
  const next = hits[i + 1]?.idx ?? src.length;
  const speciesId = cur.file.replace(".glb", "");
  const flags = {
    animated: fieldNear(cur.idx, next, "animated") ?? "(none)",
    rigLite: fieldNear(cur.idx, next, "rigLite") ?? "(none)",
    modelYaw: fieldNear(cur.idx, next, "modelYaw") ?? "0",
  };
  try {
    const j = readGlbJson(path.join(root, "public/models", cur.file));
    const anims = (j.animations ?? []).map((a) => a.name || "(unnamed)");
    const skins = j.skins ?? [];
    const joints = skins.reduce((n, s) => n + (s.joints?.length ?? 0), 0);
    results.push({ speciesId, ...flags, animCount: anims.length, anims, skinned: skins.length > 0, joints });
  } catch (e) {
    results.push({ speciesId, ...flags, error: String(e).slice(0, 100) });
  }
}

results.sort((a, b) => (a.animCount ?? -1) - (b.animCount ?? -1));
for (const r of results) {
  if (r.error) {
    console.log(`ERR   ${r.speciesId}: ${r.error}`);
    continue;
  }
  const canAnimate = r.animCount > 0 && r.skinned;
  const flag = canAnimate ? "RIGGED " : "STATIC ";
  console.log(
    `${flag} ${r.speciesId.padEnd(24)} yaw=${String(r.modelYaw).padEnd(11)} animated=${String(r.animated).padEnd(7)} rigLite=${String(r.rigLite).padEnd(7)} clips=${r.animCount} skin=${r.skinned} joints=${r.joints} [${r.anims.join(",")}]`
  );
}
const staticOnes = results.filter((r) => !r.error && !(r.animCount > 0 && r.skinned));
console.log(`\nTotal=${results.length}  STATIC(no clips or no skin)=${staticOnes.length}: ${staticOnes.map((r) => r.speciesId).join(", ")}`);
