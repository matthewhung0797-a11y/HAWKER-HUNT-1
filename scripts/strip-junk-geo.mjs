// 清除 Tripo 生成模型入面嘅白色雜件幾何（地台影板／幻覺背旗）
//
// 用法：
//   node scripts/strip-junk-geo.mjs --analyze <glb...>        列出每個組件嘅大小／扁平度／平均貼圖色
//   node scripts/strip-junk-geo.mjs <glb> <out.glb> <comp,comp,...>   刪除指定組件（用 analyze 輸出嘅 index）
//   node scripts/strip-junk-geo.mjs --auto <glb> <out.glb> [comp,comp,...]
//       自動剝地台碎片（y≈0、超扁、闊過 0.1）；可以再逗號補指定組件
//   node scripts/strip-junk-geo.mjs --box <glb> <out.glb> minX,minY,minZ,maxX,maxY,maxZ [--dry]
//       剷走 bbox 完全喺指定 AABB 入面嘅組件（--dry 只列唔剷）
//
// 原理：Tripo 有時會喺角色網格夾埋一塊地台（扁平橫板貼地）或者背旗（直立薄板），
// 通常冇 UV 對應到角色貼圖，成塊近白色。rig 之後呢啲板俾骨拖住，
// 攻擊動作時會成塊白板飛出嚟。
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import sharp from "sharp";

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });

function findComponents(prim) {
  const idx = prim.getIndices().getArray();
  const n = prim.getAttribute("POSITION").getCount();
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
    if (a !== b) parent[a] = b;
    if (find(a) !== find(c)) parent[find(a)] = find(c);
  }
  // 每個頂點嘅組件根
  const rootOf = new Int32Array(n);
  for (let i = 0; i < n; i++) rootOf[i] = find(i);
  return rootOf;
}

async function texSampler(doc) {
  const mat = doc.getRoot().listMaterials()[0];
  const texImg = mat?.getBaseColorTexture()?.getImage();
  if (!texImg) return null;
  const { data, info } = await sharp(Buffer.from(texImg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (u, v) => {
    const x = Math.min(info.width - 1, Math.max(0, Math.round(u * (info.width - 1))));
    const y = Math.min(info.height - 1, Math.max(0, Math.round(v * (info.height - 1))));
    const o = (y * info.width + x) * 4;
    return [data[o], data[o + 1], data[o + 2]];
  };
}

async function analyze(file) {
  const doc = await io.read(file);
  const sample = await texSampler(doc);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const rootOf = findComponents(prim);
      const pos = prim.getAttribute("POSITION").getArray();
      const uv = prim.getAttribute("TEXCOORD_0")?.getArray();
      const idx = prim.getIndices().getArray();
      const n = rootOf.length;
      const tris = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        const r = rootOf[idx[t]];
        tris.set(r, (tris.get(r) ?? 0) + 1);
      }
      const stats = new Map();
      for (let i = 0; i < n; i++) {
        const r = rootOf[i];
        let s = stats.get(r);
        if (!s) {
          s = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], rgb: [0, 0, 0], cnt: 0 };
          stats.set(r, s);
        }
        for (let k = 0; k < 3; k++) {
          const v = pos[i * 3 + k];
          if (v < s.min[k]) s.min[k] = v;
          if (v > s.max[k]) s.max[k] = v;
        }
        if (sample && uv) {
          const [cr, cg, cb] = sample(uv[i * 2], uv[i * 2 + 1]);
          s.rgb[0] += cr;
          s.rgb[1] += cg;
          s.rgb[2] += cb;
        }
        s.cnt++;
      }
      // 大組件頭 20 個＋所有「白色候選」（唔理大小）
      const sorted = [...tris.entries()].sort((a, b) => b[1] - a[1]);
      const whiteCandidates = sorted.filter(([root, t]) => {
        if (t < 12) return false;
        const s = stats.get(root);
        const rgb = s.rgb.map((v) => Math.round(v / s.cnt));
        const bright = (rgb[0] + rgb[1] + rgb[2]) / 3 / 255;
        const sat = (Math.max(...rgb) - Math.min(...rgb)) / Math.max(1, Math.max(...rgb));
        return bright > 0.62 && sat < 0.3;
      });
      const list = [...new Map([...sorted.slice(0, 20), ...whiteCandidates])];
      console.log(`\n${file}（組件總數 ${tris.size}；列出頭 20＋白色候選）：`);
      for (const [root, t] of list) {
        const s = stats.get(root);
        const dim = s.max.map((v, k) => v - s.min[k]);
        const flat = Math.min(...dim) / Math.max(...dim);
        const rgb = s.rgb.map((v) => Math.round(v / s.cnt));
        const bright = (rgb[0] + rgb[1] + rgb[2]) / 3 / 255;
        const sat = (Math.max(...rgb) - Math.min(...rgb)) / Math.max(1, Math.max(...rgb));
        console.log(
          `  comp=${root} tris=${t} bbox=[${dim.map((d) => d.toFixed(2)).join(",")}] ` +
            `y=[${s.min[1].toFixed(2)}..${s.max[1].toFixed(2)}] flat=${flat.toFixed(2)} ` +
            `rgb=(${rgb.join(",")}) bright=${bright.toFixed(2)} sat=${sat.toFixed(2)}` +
            (bright > 0.72 && sat < 0.22 ? "  ← 白色候選" : "")
        );
      }
    }
  }
}

async function strip(file, out, compIds, auto = false) {
  const doc = await io.read(file);
  const kill = new Set(compIds);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const rootOf = findComponents(prim);
      if (auto) {
        // 地台碎片：貼地（ymax≤0.05）、超薄（ydim≤0.03）、有返咁上下闊（xz≥0.1）
        const pos = prim.getAttribute("POSITION").getArray();
        const n = rootOf.length;
        const box = new Map();
        for (let i = 0; i < n; i++) {
          const r = rootOf[i];
          let b = box.get(r);
          if (!b) {
            b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
            box.set(r, b);
          }
          for (let k = 0; k < 3; k++) {
            const v = pos[i * 3 + k];
            if (v < b.min[k]) b.min[k] = v;
            if (v > b.max[k]) b.max[k] = v;
          }
        }
        for (const [r, b] of box) {
          const ydim = b.max[1] - b.min[1];
          const wide = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
          if (b.max[1] <= 0.05 && ydim <= 0.03 && wide >= 0.1) kill.add(r);
        }
      }
      const idxAcc = prim.getIndices();
      const idx = idxAcc.getArray();
      const keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        if (!kill.has(rootOf[idx[t]])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      console.log(`${file}: tris ${idx.length / 3} → ${keep.length / 3}`);
      idxAcc.setArray(idx instanceof Uint16Array ? new Uint16Array(keep) : new Uint32Array(keep));
    }
  }
  await io.write(out, doc);
  console.log(`→ ${out}`);
}

const args = process.argv.slice(2);
if (args[0] === "--analyze") {
  for (const f of args.slice(1)) await analyze(f);
} else if (args[0] === "--box") {
  const [, file, out, boxStr] = args;
  const dry = args.includes("--dry");
  const [minX, minY, minZ, maxX, maxY, maxZ] = boxStr.split(",").map(Number);
  const doc = await io.read(file);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const rootOf = findComponents(prim);
      const pos = prim.getAttribute("POSITION").getArray();
      const n = rootOf.length;
      const box = new Map();
      for (let i = 0; i < n; i++) {
        const r = rootOf[i];
        let b = box.get(r);
        if (!b) {
          b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
          box.set(r, b);
        }
        for (let k = 0; k < 3; k++) {
          const v = pos[i * 3 + k];
          if (v < b.min[k]) b.min[k] = v;
          if (v > b.max[k]) b.max[k] = v;
        }
      }
      const kill = new Set();
      for (const [r, b] of box) {
        if (
          b.min[0] >= minX && b.max[0] <= maxX &&
          b.min[1] >= minY && b.max[1] <= maxY &&
          b.min[2] >= minZ && b.max[2] <= maxZ
        )
          kill.add(r);
      }
      const idxAcc = prim.getIndices();
      const idx = idxAcc.getArray();
      let killTris = 0;
      for (let t = 0; t < idx.length; t += 3) if (kill.has(rootOf[idx[t]])) killTris++;
      console.log(`${file}: box 內組件 ${kill.size} 個，tris ${killTris}/${idx.length / 3}`);
      if (dry) continue;
      const keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        if (!kill.has(rootOf[idx[t]])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      idxAcc.setArray(idx instanceof Uint16Array ? new Uint16Array(keep) : new Uint32Array(keep));
    }
  }
  if (!dry) {
    await io.write(out, doc);
    console.log(`→ ${out}`);
  }
} else if (args[0] === "--auto") {
  const [, file, out, comps] = args;
  if (!out) {
    console.error("usage: strip-junk-geo.mjs --auto <glb> <out> [comp,comp,...]");
    process.exit(1);
  }
  await strip(file, out, comps ? comps.split(",").map(Number) : [], true);
} else {
  const [file, out, comps] = args;
  if (!comps) {
    console.error("usage: strip-junk-geo.mjs --analyze <glb...> | <glb> <out> <comp,comp,...>");
    process.exit(1);
  }
  await strip(file, out, comps.split(",").map(Number));
}
