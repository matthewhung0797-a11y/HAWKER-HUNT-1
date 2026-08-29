// Tripo rig ＋ retarget 動畫管線（俾 Meshy rig 唔到嘅圓碌碌精靈用）
//
// 用法：node scripts/tripo-rig-animate.mjs [--spec=mixamo] <spirit-id...>
//   --spec=mixamo 用標準人形 Mixamo 骨架 rig（武器型精靈 retarget 對手臂較準；
//                 預設 tripo 自家骨架，圓碌碌非人形先用預設）
//
// 每隻精靈：
//   1. animate_rig（用 gen-3d 嘅 tripo task id）
//   2. 對每個 preset 動作建 animate_retarget 任務並下載 GLB
//
// 輸出：model-pipeline/gen/anim/<id>/<action>.glb（同 Meshy 管線一樣布局，
//       之後照跑 merge-anims.mjs ＋ finalize-models.mjs）

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "./pipeline/lib/env.mjs";

// CI secrets／本機 .env.local（唔硬讀 .env.local）
const TRIPO_KEY = getEnv("TRIPO_API_KEY");
const H = { Authorization: `Bearer ${TRIPO_KEY}`, "Content-Type": "application/json" };
const BASE = "https://api.tripo3d.ai/v2/openapi";

// 打鬥動作 → Tripo preset 對應
const ACTIONS = [
  ["idle", "preset:idle"],
  ["walk", "preset:walk"],
  ["attack", "preset:slash"],
  ["skill", "preset:shoot"],
  ["hit", "preset:hurt"],
  ["down", "preset:fall"],
  ["victory", "preset:jump"],
];

const OUT = "model-pipeline/gen";
const genTasks = existsSync(join(OUT, "tasks.json"))
  ? JSON.parse(readFileSync(join(OUT, "tasks.json"), "utf8"))
  : {};
const TASKS_FILE = join(OUT, "tasks-tripo.json");
const tasks = existsSync(TASKS_FILE) ? JSON.parse(readFileSync(TASKS_FILE, "utf8")) : {};
const saveTasks = () => writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function createTask(payload) {
  const res = await fetch(`${BASE}/task`, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`create ${payload.type}: ${JSON.stringify(json)}`);
  return json.data.task_id;
}

async function poll(taskId, label) {
  for (;;) {
    const res = await fetch(`${BASE}/task/${taskId}`, { headers: H });
    const json = await res.json();
    if (json.code !== 0) throw new Error(`poll: ${JSON.stringify(json)}`);
    const t = json.data;
    if (t.status === "success") return t;
    if (["failed", "cancelled", "banned", "expired"].includes(t.status))
      throw new Error(`${label} ${t.status}`);
    process.stdout.write(`\r  ${label} ${t.status} ${t.progress ?? 0}%   `);
    await sleep(6000);
  }
}

async function rigAndAnimate(id, spec) {
  const genTaskId = genTasks[`tripo:${id}`]?.taskId;
  if (!genTaskId) throw new Error(`${id}: 未有 tripo 生成任務，先跑 gen-3d.mjs --backend=tripo`);

  const dir = join(OUT, "anim", id);
  mkdirSync(dir, { recursive: true });

  // ── rig ──（mixamo spec 用獨立 key，唔好撞舊 tripo 骨架嘅紀錄）
  const rigKey = spec ? `rig:${id}:${spec}` : `rig:${id}`;
  let rigTaskId = tasks[rigKey]?.taskId;
  if (!rigTaskId || tasks[rigKey]?.failed) {
    rigTaskId = await createTask({
      type: "animate_rig",
      original_model_task_id: genTaskId,
      model_version: spec ? "v2.5-20260210" : "v2.0-20250506",
      ...(spec ? { spec, rig_type: "biped" } : {}),
      out_format: "glb",
    });
    tasks[rigKey] = { taskId: rigTaskId, createdAt: Date.now() };
    saveTasks();
    console.log(`${id}: rig task ${rigTaskId}`);
  }
  try {
    await poll(rigTaskId, `${id}/rig`);
    tasks[rigKey].done = true;
    delete tasks[rigKey].failed;
    saveTasks();
  } catch (e) {
    tasks[rigKey].failed = true;
    saveTasks();
    throw new Error(`${id} rig 失敗: ${e.message}`);
  }
  console.log(`\n${id}: rigged ✔`);

  // ── retarget 各動作 ──
  for (const [name, preset] of ACTIONS) {
    const aKey = spec ? `anim:${id}:${name}:${spec}` : `anim:${id}:${name}`;
    if (tasks[aKey]?.done && existsSync(join(dir, `${name}.glb`))) {
      console.log(`${id}/${name}: 已存在，跳過`);
      continue;
    }
    let animTaskId = tasks[aKey]?.taskId;
    if (!animTaskId || tasks[aKey]?.failed) {
      animTaskId = await createTask({
        type: "animate_retarget",
        original_model_task_id: rigTaskId,
        animation: preset,
        out_format: "glb",
        bake_animation: true,
        animate_in_place: true,
      });
      tasks[aKey] = { taskId: animTaskId, createdAt: Date.now() };
      saveTasks();
    }
    try {
      const t = await poll(animTaskId, `${id}/${name}`);
      const url = t.output?.model ?? t.result?.model?.url;
      if (!url) throw new Error(`no model url in ${JSON.stringify(t.output ?? t.result)}`);
      await download(url, join(dir, `${name}.glb`));
      tasks[aKey].done = true;
      delete tasks[aKey].failed;
      saveTasks();
      console.log(`\n${id}/${name}: ✔`);
    } catch (e) {
      tasks[aKey].failed = true;
      saveTasks();
      console.error(`\n${id}/${name}: FAILED ${e.message}`);
    }
  }
}

const argv = process.argv.slice(2);
const spec = argv.find((a) => a.startsWith("--spec="))?.split("=")[1];
const ids = argv.filter((a) => !a.startsWith("--"));
if (ids.length === 0) {
  console.error("usage: node scripts/tripo-rig-animate.mjs [--spec=mixamo] <spirit-id...>");
  process.exit(1);
}
if (!TRIPO_KEY?.startsWith("tsk_")) {
  console.error("TRIPO_API_KEY 缺失或格式錯（要 tsk_…；CI 請設 Actions secret）");
  process.exit(1);
}
for (const id of ids) {
  try {
    await rigAndAnimate(id, spec);
  } catch (e) {
    console.error(`\n${id} FAILED: ${e.message}`);
  }
}
console.log("\nTripo rig+動畫完成");
