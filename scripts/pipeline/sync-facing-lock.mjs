// 將 test-shots/facing-cal/decisions.json 同步入 draft + Supabase manifest.facingLockByStage
// 用法：node scripts/pipeline/sync-facing-lock.mjs <draftId>
// 要喺 apply-facing-lock.mjs 之後跑（species.ts 已寫 lock）。

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { readDraft, writeDraft } from "./lib/draft.mjs";
import { upsertPetDraft, petsDbConfigured } from "./lib/pets-db.mjs";

const YAW = {
  0: 0,
  "+90": Math.PI / 2,
  "-90": -Math.PI / 2,
  180: Math.PI,
};

const draftId = process.argv[2];
if (!draftId) {
  console.error("usage: node scripts/pipeline/sync-facing-lock.mjs <draftId>");
  process.exit(1);
}

const decisionsPath = resolve("test-shots/facing-cal/decisions.json");
if (!existsSync(decisionsPath)) {
  console.error("搵唔到", decisionsPath);
  process.exit(1);
}

const decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
const draft = readDraft(draftId);
if (!draft) {
  console.error("搵唔到 draft", draftId);
  process.exit(1);
}

const at = new Date().toISOString();
const facingLockByStage = { ...(draft.facingLockByStage ?? {}) };
for (const d of decisions) {
  const yaw = YAW[d.yaw];
  if (yaw === undefined) {
    console.error("bad yaw", d);
    process.exit(1);
  }
  facingLockByStage[d.id] = { verified: true, modelYaw: yaw, at };
  // 同步入 speciesList
  if (Array.isArray(draft.speciesList)) {
    const sp = draft.speciesList.find((s) => s.id === d.id);
    if (sp) sp.modelYaw = yaw;
  }
}

draft.facingLockByStage = facingLockByStage;
draft.manifest = { ...(draft.manifest ?? {}), facingLockByStage };
draft.artifacts = { ...(draft.artifacts ?? {}), facingLockByStage };
writeDraft(draft);
console.log("✅ draft facingLockByStage:", Object.keys(facingLockByStage).join(", "));

if (petsDbConfigured) {
  const res = await upsertPetDraft(draft);
  console.log(res.ok ? "✅ pets DB 已同步" : "⚠️ pets DB 同步失敗／skip");
}
