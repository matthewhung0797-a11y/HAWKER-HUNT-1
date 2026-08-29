// Tripo GLB → rotate -90 → Meshy rig；422 則退 Tripo rig。然後 finalize＋strip-junk。
// 用法：node scripts/hq-rig-batch.mjs <id...>
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) {
  console.error("usage: node scripts/hq-rig-batch.mjs <id...>");
  process.exit(1);
}

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

/** @type {Record<string, "meshy"|"tripo">} */
const modes = {};

for (const id of ids) {
  const src = `model-pipeline/gen/tripo/${id}.glb`;
  const rot = `model-pipeline/gen/tripo/${id}.rot-90.glb`;
  if (!existsSync(src)) {
    console.error(`SKIP ${id}: missing ${src}`);
    continue;
  }
  run(`node scripts/rotate-glb.mjs ${src} ${rot} -90`);
  try {
    run(`node scripts/rig-animate.mjs --src=tripo --glb=${rot} ${id}`);
    if (!existsSync(`model-pipeline/gen/anim/${id}/idle.glb`)) throw new Error("no idle after meshy");
    modes[id] = "meshy";
  } catch (e) {
    console.warn(`${id}: Meshy failed (${e.message}) → Tripo rig`);
    run(`node scripts/tripo-rig-animate.mjs ${id}`);
    modes[id] = "tripo";
  }
}

run(`node scripts/finalize-models.mjs ${ids.join(" ")}`);
for (const id of ids) {
  const out = `public/models/${id}.glb`;
  if (existsSync(out)) {
    try {
      run(`node scripts/strip-junk-geo.mjs --auto ${out} ${out}`);
    } catch (e) {
      console.warn(`strip ${id}: ${e.message}`);
    }
  }
}

console.log("\n=== rig modes ===");
console.log(JSON.stringify(modes, null, 2));
