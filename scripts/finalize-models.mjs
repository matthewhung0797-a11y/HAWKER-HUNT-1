// 最終化模型：有 rig 動畫就 merge+壓縮，冇就直接壓縮靜態網格 → public/models/<id>.glb
//
// 用法：node scripts/finalize-models.mjs <spirit-id...> 或 --all

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ALL = [
  "oily-rice-chick",
  "silky-chicken-warrior",
  "hainan-chicken-god",
  "little-laksa",
  "laksa-warrior",
  "laksa-dragon",
  "bkt-cub",
  "bkt-warrior",
  "bkt-grandmaster",
  "tutu-sprite",
  "lapis-queen",
  "pastry-queen",
  "kaya-blob",
  "kaya-warrior",
  "kaya-dragon",
];

const args = process.argv.slice(2);
const ids = args.includes("--all") ? ALL : args;

const summary = [];
for (const id of ids) {
  const animDir = `model-pipeline/gen/anim/${id}`;
  const meshPath = `model-pipeline/gen/meshy/${id}.glb`;
  const out = `public/models/${id}.glb`;
  try {
    let src;
    let animated = false;
    if (existsSync(join(animDir, "idle.glb"))) {
      execSync(`node scripts/merge-anims.mjs ${id}`, { stdio: "inherit" });
      src = join(animDir, "merged.glb");
      animated = true;
    } else if (existsSync(meshPath)) {
      src = meshPath;
    } else {
      console.warn(`${id}: 冇模型檔案，跳過`);
      continue;
    }
    execSync(
      `npx gltf-transform optimize "${src}" "${out}" --compress draco --texture-compress webp --texture-size 1024 --no-flatten --no-join --simplify false`,
      { stdio: "pipe" }
    );
    summary.push({ id, animated });
    console.log(`${id}: → ${out} (${animated ? "有動畫" : "靜態"})`);
  } catch (e) {
    console.error(`${id} FAILED: ${e.message}`);
  }
}

console.log("\n=== species.ts 更新提示 ===");
for (const s of summary) {
  console.log(`${s.id}: modelUrl: "/models/${s.id}.glb"${s.animated ? ", animated: true" : ""}`);
}
