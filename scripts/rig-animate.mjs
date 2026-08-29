// Meshy rig ＋ 動畫管線：將 image-to-3d 任務產出嘅模型自動上骨架，再套用打鬥動畫組
//
// 用法：
//   node scripts/rig-animate.mjs <spirit-id> [spirit-id...]
//   node scripts/rig-animate.mjs --src=tripo <spirit-id...>            用 Tripo GLB（data URI）入 Meshy rig
//   node scripts/rig-animate.mjs --src=tripo --glb=<path> <spirit-id>  自訂 GLB 檔（例如已 -90° 旋轉嘅臨時檔）
//
// 每隻精靈：
//   1. rigging（meshy 生成 task 做 input_task_id，或者 --src=tripo 用本地 GLB 做 model_url）
//   2. 對每個 ACTION 建 animation 任務並下載 GLB
//
// 輸出：
//   model-pipeline/gen/anim/<id>/character.glb          rigged 角色
//   model-pipeline/gen/anim/<id>/<action>.glb           各動作（withSkin，可直接播）
//   model-pipeline/gen/tasks.json                       任務記錄（斷點續跑）

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "./pipeline/lib/env.mjs";

// CI secrets／本機 .env.local（唔硬讀 .env.local）
const KEY = getEnv("MESHY_API_KEY");
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BASE = "https://api.meshy.ai/openapi/v1";

// 打鬥場面需要嘅動作組（id 對應 Meshy 動畫庫）
const ACTIONS = [
  ["idle", 0], // Idle
  ["attack", 92], // Double Combo Attack
  ["skill", 125], // Charged Spell Cast（放技能）
  ["hit", 178], // Hit Reaction
  ["down", 187], // Knock Down（被擊倒）
  ["victory", 59], // Victory Cheer
];

const OUT = "model-pipeline/gen";
// gen 任務記錄只讀（gen-3d.mjs 可能同時運行緊，唔好寫佢個檔）
const genTasks = existsSync(join(OUT, "tasks.json"))
  ? JSON.parse(readFileSync(join(OUT, "tasks.json"), "utf8"))
  : {};
const TASKS_FILE = join(OUT, "tasks-anim.json");
const tasks = existsSync(TASKS_FILE) ? JSON.parse(readFileSync(TASKS_FILE, "utf8")) : {};
const saveTasks = () => writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function poll(path) {
  for (;;) {
    const res = await fetch(`${BASE}/${path}`, { headers: H });
    const json = await res.json();
    if (!res.ok) throw new Error(`poll ${res.status}: ${JSON.stringify(json)}`);
    if (json.status === "SUCCEEDED") return json;
    if (json.status === "FAILED" || json.status === "CANCELED")
      throw new Error(`task ${json.status}: ${json.task_error?.message}`);
    process.stdout.write(`\r  ${path.slice(0, 30)} ${json.status} ${json.progress ?? 0}%   `);
    await sleep(8000);
  }
}

async function create(path, payload) {
  const res = await fetch(`${BASE}/${path}`, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const json = await res.json();
  if (!res.ok) throw new Error(`create ${path} ${res.status}: ${JSON.stringify(json)}`);
  return json.result;
}

async function rigAndAnimate(id, src, glbOverride) {
  const dir = join(OUT, "anim", id);
  mkdirSync(dir, { recursive: true });

  // rig 輸入：meshy 生成 task，或者 tripo GLB（base64 data URI）
  let rigInput;
  if (src === "tripo") {
    const glbPath = glbOverride ?? join(OUT, "tripo", `${id}.glb`);
    if (!existsSync(glbPath)) throw new Error(`${id}: 冇 ${glbPath}，先跑 gen-3d.mjs --backend=tripo`);
    const b64 = readFileSync(glbPath).toString("base64");
    rigInput = { model_url: `data:application/octet-stream;base64,${b64}` };
  } else {
    const genTaskId = genTasks[`meshy:${id}`]?.taskId;
    if (!genTaskId) throw new Error(`${id}: 未有 meshy 生成任務，先跑 gen-3d.mjs`);
    rigInput = { input_task_id: genTaskId };
  }

  // ── rig ──
  const rigKey = src === "tripo" ? `rig-tripo:${id}` : `rig:${id}`;
  let rigTaskId = tasks[rigKey]?.taskId;
  if (!rigTaskId || tasks[rigKey]?.failed) {
    rigTaskId = await create("rigging", { ...rigInput, height_meters: 1.2 });
    tasks[rigKey] = { taskId: rigTaskId, createdAt: Date.now() };
    saveTasks();
    console.log(`${id}: rig task ${rigTaskId}`);
  }
  let rig;
  try {
    rig = await poll(`rigging/${rigTaskId}`);
    delete tasks[rigKey].failed;
    tasks[rigKey].done = true;
    saveTasks();
  } catch (e) {
    tasks[rigKey].failed = true;
    saveTasks();
    throw new Error(`${id} rig 失敗（可能非人形）: ${e.message}`);
  }
  await download(rig.result.rigged_character_glb_url, join(dir, "character.glb"));
  // 行路動畫係 rig 附送嘅 basic animation（walking/running）
  const walkUrl = rig.result.basic_animations?.walking_glb_url;
  if (walkUrl && !existsSync(join(dir, "walk.glb"))) await download(walkUrl, join(dir, "walk.glb"));
  console.log(`\n${id}: rigged ✔ (credits ${rig.consumed_credits})`);

  // ── 動畫：全部並行建任務再逐個等 ──
  for (const [name, actionId] of ACTIONS) {
    const aKey = `anim:${id}:${name}`;
    if (tasks[aKey]?.done && existsSync(join(dir, `${name}.glb`))) {
      console.log(`${id}/${name}: 已存在，跳過`);
      continue;
    }
    let animTaskId = tasks[aKey]?.taskId;
    if (!animTaskId || tasks[aKey]?.failed) {
      animTaskId = await create("animations", { rig_task_id: rigTaskId, action_id: actionId });
      tasks[aKey] = { taskId: animTaskId, createdAt: Date.now() };
      saveTasks();
    }
    try {
      const anim = await poll(`animations/${animTaskId}`);
      await download(anim.result.animation_glb_url, join(dir, `${name}.glb`));
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
const src = argv.find((a) => a.startsWith("--src="))?.split("=")[1];
const glbOverride = argv.find((a) => a.startsWith("--glb="))?.split("=")[1];
const ids = argv.filter((a) => !a.startsWith("--"));
if (ids.length === 0) {
  console.error("usage: node scripts/rig-animate.mjs [--src=tripo] [--glb=<path>] <spirit-id...>");
  process.exit(1);
}
if (!KEY?.startsWith("msy_")) {
  console.error("MESHY_API_KEY 缺失或格式錯（要 msy_…；CI 請設 Actions secret）");
  process.exit(1);
}
for (const id of ids) {
  try {
    await rigAndAnimate(id, src, glbOverride);
  } catch (e) {
    console.error(`\n${id} FAILED: ${e.message}`);
  }
}
console.log("\nrig+動畫完成");
