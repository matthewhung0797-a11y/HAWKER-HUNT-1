// 圖生 3D 管線：用 2D 精靈立繪（去背全身圖）分別打 Tripo 同 Meshy API 生成 GLB
//
// 用法：
//   node scripts/gen-3d.mjs <spirit-id> [spirit-id...]        兩個後端都跑（冇 key 嘅自動跳過）
//   node scripts/gen-3d.mjs --backend=meshy <spirit-id...>    只跑 Meshy
//   node scripts/gen-3d.mjs --backend=tripo <spirit-id...>    只跑 Tripo
//
// 輸出：
//   model-pipeline/gen/meshy/<id>.glb ＋ <id>-{front,right,back,left}.png 四視角預覽
//   model-pipeline/gen/tripo/<id>.glb
//   model-pipeline/gen/tasks.json（task id 記錄，方便重新下載／追查）

import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "./pipeline/lib/env.mjs";

// CI 用 Actions secrets（process.env）；本機用 .env.local——唔好硬 readFile 冇檔就炸
const MESHY_KEY = getEnv("MESHY_API_KEY");
const TRIPO_KEY = getEnv("TRIPO_API_KEY");

const args = process.argv.slice(2);
const backendArg = args.find((a) => a.startsWith("--backend="))?.split("=")[1];
const ids = args.filter((a) => !a.startsWith("--"));
if (ids.length === 0) {
  console.error("usage: node scripts/gen-3d.mjs [--backend=meshy|tripo] <spirit-id...>");
  process.exit(1);
}

const OUT = "model-pipeline/gen";
mkdirSync(join(OUT, "meshy"), { recursive: true });
mkdirSync(join(OUT, "tripo"), { recursive: true });
const TASKS_FILE = join(OUT, "tasks.json");
const tasks = existsSync(TASKS_FILE) ? JSON.parse(readFileSync(TASKS_FILE, "utf8")) : {};
const saveTasks = () => writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 去背全身 webp → PNG buffer（Meshy/Tripo 都收 png；透明背景效果最好） */
async function spiritPng(id) {
  const src = `public/spirits/full/${id}.webp`;
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  return sharp(src).png().toBuffer();
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}: ${url.slice(0, 80)}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// ── Meshy 後端 ──
const MESHY_BASE = "https://api.meshy.ai/openapi/v1/image-to-3d";
const meshyHeaders = { Authorization: `Bearer ${MESHY_KEY}`, "Content-Type": "application/json" };

async function meshyCreate(id) {
  const png = await spiritPng(id);
  const payload = {
    image_url: `data:image/png;base64,${png.toString("base64")}`,
    ai_model: "latest",
    should_texture: true,
    enable_pbr: false,
    should_remesh: true,
    topology: "triangle",
    target_polycount: 20000,
    // A-pose 對之後 auto-rig／動畫 retarget 至關重要
    pose_mode: "a-pose",
    target_formats: ["glb"],
    multi_view_thumbnails: true,
  };
  const res = await fetch(MESHY_BASE, { method: "POST", headers: meshyHeaders, body: JSON.stringify(payload) });
  const json = await res.json();
  if (!res.ok) throw new Error(`meshy create ${res.status}: ${JSON.stringify(json)}`);
  return json.result;
}

async function meshyPoll(taskId) {
  for (;;) {
    const res = await fetch(`${MESHY_BASE}/${taskId}`, { headers: meshyHeaders });
    const json = await res.json();
    if (!res.ok) throw new Error(`meshy poll ${res.status}: ${JSON.stringify(json)}`);
    if (json.status === "SUCCEEDED") return json;
    if (json.status === "FAILED" || json.status === "CANCELED")
      throw new Error(`meshy task ${json.status}: ${json.task_error?.message}`);
    process.stdout.write(`\r  meshy ${taskId.slice(0, 8)} ${json.status} ${json.progress ?? 0}%   `);
    await sleep(12000);
  }
}

async function runMeshy(id) {
  const key = `meshy:${id}`;
  let taskId = tasks[key]?.taskId;
  if (!taskId || tasks[key]?.failed) {
    taskId = await meshyCreate(id);
    tasks[key] = { taskId, createdAt: Date.now() };
    saveTasks();
    console.log(`meshy ${id}: task ${taskId}`);
  } else {
    console.log(`meshy ${id}: 重用已有 task ${taskId}`);
  }
  try {
    const task = await meshyPoll(taskId);
    console.log(`\nmeshy ${id}: done (credits used: ${task.consumed_credits})`);
    await download(task.model_urls.glb, join(OUT, "meshy", `${id}.glb`));
    for (const [view, url] of Object.entries(task.thumbnail_urls ?? {})) {
      await download(url, join(OUT, "meshy", `${id}-${view}.png`));
    }
    tasks[key].done = true;
    delete tasks[key].failed;
    saveTasks();
  } catch (e) {
    tasks[key].failed = true;
    saveTasks();
    throw e;
  }
}

// ── Tripo 後端 ──
const TRIPO_BASE = "https://api.tripo3d.ai/v2/openapi";
const tripoAuth = { Authorization: `Bearer ${TRIPO_KEY}` };

async function tripoUpload(id) {
  const png = await spiritPng(id);
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), `${id}.png`);
  const res = await fetch(`${TRIPO_BASE}/upload`, { method: "POST", headers: tripoAuth, body: form });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`tripo upload: ${JSON.stringify(json)}`);
  return json.data.image_token;
}

async function tripoCreate(id) {
  const token = await tripoUpload(id);
  const payload = {
    type: "image_to_model",
    model_version: "v3.1-20260211",
    file: { type: "png", file_token: token },
    texture: true,
    pbr: false,
    // 手遊用低模：官方手工拓撲低模，rig 起嚟乾淨
    smart_low_poly: true,
    face_limit: 18000,
    orientation: "align_image",
  };
  const res = await fetch(`${TRIPO_BASE}/task`, {
    method: "POST",
    headers: { ...tripoAuth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`tripo create: ${JSON.stringify(json)}`);
  return json.data.task_id;
}

async function tripoPoll(taskId) {
  for (;;) {
    const res = await fetch(`${TRIPO_BASE}/task/${taskId}`, { headers: tripoAuth });
    const json = await res.json();
    if (json.code !== 0) throw new Error(`tripo poll: ${JSON.stringify(json)}`);
    const t = json.data;
    if (t.status === "success") return t;
    if (["failed", "cancelled", "banned", "expired"].includes(t.status))
      throw new Error(`tripo task ${t.status}`);
    process.stdout.write(`\r  tripo ${taskId.slice(0, 8)} ${t.status} ${t.progress ?? 0}%   `);
    await sleep(12000);
  }
}

async function runTripo(id) {
  const key = `tripo:${id}`;
  let taskId = tasks[key]?.taskId;
  if (!taskId || tasks[key]?.failed) {
    taskId = await tripoCreate(id);
    tasks[key] = { taskId, createdAt: Date.now() };
    saveTasks();
    console.log(`tripo ${id}: task ${taskId}`);
  } else {
    console.log(`tripo ${id}: 重用已有 task ${taskId}`);
  }
  try {
    const t = await tripoPoll(taskId);
    console.log(`\ntripo ${id}: done`);
    const url = t.output?.pbr_model ?? t.output?.model ?? t.result?.pbr_model?.url ?? t.result?.model?.url;
    if (!url) throw new Error(`tripo ${id}: no model url in ${JSON.stringify(t.output ?? t.result)}`);
    await download(url, join(OUT, "tripo", `${id}.glb`));
    if (t.output?.rendered_image) await download(t.output.rendered_image, join(OUT, "tripo", `${id}-preview.webp`));
    tasks[key].done = true;
    delete tasks[key].failed;
    saveTasks();
  } catch (e) {
    tasks[key].failed = true;
    saveTasks();
    throw e;
  }
}

// ── 主流程：每個後端內部串行（避免 rate limit），兩個後端並行 ──
const backends = [];
if (!backendArg || backendArg === "meshy") {
  if (MESHY_KEY?.startsWith("msy_")) backends.push(["meshy", runMeshy]);
  else console.warn("跳過 Meshy：MESHY_API_KEY 缺失或格式錯");
}
if (!backendArg || backendArg === "tripo") {
  if (TRIPO_KEY?.startsWith("tsk_")) backends.push(["tripo", runTripo]);
  else console.warn("跳過 Tripo：而家嘅 key 係 tcli_（Client ID），要用 tsk_ 開頭嘅 API key");
}

const results = await Promise.allSettled(
  backends.map(async ([name, run]) => {
    for (const id of ids) {
      try {
        await run(id);
      } catch (e) {
        console.error(`\n${name} ${id} FAILED: ${e.message}`);
      }
    }
  })
);
void results;
console.log("\n全部完成。輸出喺 model-pipeline/gen/");
