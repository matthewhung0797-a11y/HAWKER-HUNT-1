// 將 Meshy 每個動作獨立嘅 GLB 合併成一個多 clip GLB（mesh/rig 只保留一份）
//
// 用法：node scripts/merge-anims.mjs <spirit-id> [spirit-id...]
// 輸入：model-pipeline/gen/anim/<id>/{idle,walk,attack,skill,hit,down,victory}.glb
// 輸出：model-pipeline/gen/anim/<id>/merged.glb（之後再經 gltf-transform optimize 壓縮）

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { mergeDocuments, prune, dedup, unpartition } from "@gltf-transform/functions";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ACTIONS = ["idle", "walk", "attack", "skill", "hit", "down", "victory"];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function merge(id) {
  const dir = `model-pipeline/gen/anim/${id}`;
  const basePath = join(dir, "idle.glb");
  if (!existsSync(basePath)) throw new Error(`missing ${basePath}`);

  const doc = await io.read(basePath);
  const root = doc.getRoot();
  doc.setLogger({ debug() {}, info() {}, warn: console.warn, error: console.error });
  for (const anim of root.listAnimations()) anim.setName("idle");
  const baseScene = root.listScenes()[0];

  // base scene 節點名 → Node 對照表
  const baseNodes = new Map();
  baseScene.traverse((n) => {
    if (n.getName()) baseNodes.set(n.getName(), n);
  });

  for (const action of ACTIONS.slice(1)) {
    const p = join(dir, `${action}.glb`);
    if (!existsSync(p)) {
      console.warn(`${id}: 冇 ${action}.glb，跳過`);
      continue;
    }
    const src = await io.read(p);
    for (const anim of src.getRoot().listAnimations()) anim.setName(action);
    // 合併後 src 內容成為 doc 嘅第二個 scene
    mergeDocuments(doc, src);
    const scenes = root.listScenes();
    const appended = scenes[scenes.length - 1];
    // 將新動畫嘅 channel target 重指向 base scene 同名節點
    for (const anim of root.listAnimations()) {
      if (anim.getName() !== action) continue;
      for (const ch of anim.listChannels()) {
        const target = ch.getTargetNode();
        const name = target?.getName();
        if (name && baseNodes.has(name)) ch.setTargetNode(baseNodes.get(name));
      }
    }
    // 移除附加場景，剩返 base mesh/rig
    appended.dispose();
  }

  // mergeDocuments 每次會帶入新 buffer，GLB 只准一個 → 先 unpartition 合併
  await doc.transform(unpartition(), prune({ keepLeaves: false }), dedup());
  await io.write(join(dir, "merged.glb"), doc);
  console.log(`${id}: merged.glb ✔（${root.listAnimations().map((a) => a.getName()).join(", ")}）`);
}

for (const id of process.argv.slice(2)) {
  try {
    await merge(id);
  } catch (e) {
    console.error(`${id} FAILED: ${e.message}`);
  }
}
