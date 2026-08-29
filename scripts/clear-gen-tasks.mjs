// 標記 gen／anim 任務失敗，逼重跑（唔刪 GLB，新任務會覆寫）
// 用法：node scripts/clear-gen-tasks.mjs <id...>
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("usage: node scripts/clear-gen-tasks.mjs <id...>");
  process.exit(1);
}

function patch(file, keys) {
  if (!existsSync(file)) return 0;
  const tasks = JSON.parse(readFileSync(file, "utf8"));
  let n = 0;
  for (const k of keys) {
    if (tasks[k]) {
      tasks[k].failed = true;
      delete tasks[k].done;
      n++;
    }
  }
  writeFileSync(file, JSON.stringify(tasks, null, 2));
  return n;
}

for (const id of ids) {
  const keys = [
    `tripo:${id}`,
    `meshy:${id}`,
    `rig:${id}`,
    `rig:${id}:tripo`,
    `anim:${id}:idle`,
  ];
  // tasks-anim 用唔同 key pattern——整段以 id 結尾嘅都標 failed
  for (const file of ["model-pipeline/gen/tasks.json", "model-pipeline/gen/tasks-anim.json", "model-pipeline/gen/tasks-tripo.json"]) {
    if (!existsSync(file)) continue;
    const tasks = JSON.parse(readFileSync(file, "utf8"));
    let n = 0;
    for (const k of Object.keys(tasks)) {
      if (k.includes(id)) {
        tasks[k].failed = true;
        delete tasks[k].done;
        n++;
      }
    }
    if (n) {
      writeFileSync(file, JSON.stringify(tasks, null, 2));
      console.log(`${file}: marked ${n} keys for ${id}`);
    }
  }
  const animDir = join("model-pipeline/gen/anim", id);
  if (existsSync(animDir)) {
    rmSync(animDir, { recursive: true, force: true });
    console.log(`removed ${animDir}`);
  }
}
console.log("DONE clear");
