// 系統二：pending pet draft 嘅檔案系統讀寫（node 腳本用）。
// 同 src/lib/pipeline/draft-store.ts 讀寫同一份 JSON，schema 要對齊
// （見 src/lib/pipeline/types.ts 嘅 PetDraft）。

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const DRAFT_DIR = "content/pending-pets";
export const INBOX_FILE = "content/pending-pets/_inbox.json";
export const INBOX_ASSETS_DIR = "content/pending-pets/_inbox-assets";

/** stage 順序（同 types.ts STAGE_ORDER 對齊） */
export const STAGE_ORDER = ["concept", "art", "model3d", "rig", "finalize", "skills", "draft"];

function draftPath(id) {
  return join(DRAFT_DIR, `${id}.json`);
}

export function readDraft(id) {
  const p = draftPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function writeDraft(draft) {
  mkdirSync(DRAFT_DIR, { recursive: true });
  draft.updatedAt = new Date().toISOString();
  writeFileSync(draftPath(draft.id), JSON.stringify(draft, null, 2) + "\n", "utf8");
  return draft;
}

export function listDrafts() {
  if (!existsSync(DRAFT_DIR)) return [];
  return readdirSync(DRAFT_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => readDraft(f.replace(/\.json$/, "")))
    .filter(Boolean);
}

/** 新建一個空 draft（concept stage 之前）。opts 收 string（向下相容）或 job/inbox 欄位。 */
export function createDraft(id, opts) {
  const o = typeof opts === "string" ? { instructions: opts } : (opts ?? {});
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: "generating",
    kind: o.kind || undefined,
    allowTextOnly: o.allowTextOnly ?? undefined,
    instructions: o.instructions || undefined,
    refImages: o.refImages?.length ? o.refImages : undefined,
    exclusive: o.exclusive || undefined,
    partnerLabel: o.partnerLabel || undefined,
    artifacts: {},
    manifest: {},
  };
}

/** 更新某 stage 嘅 manifest 記錄 */
export function markStage(draft, stage, record) {
  draft.manifest[stage] = { ...record, at: new Date().toISOString() };
  return draft;
}

/** 攞 draft 嘅階段清單（有 family 就三階；舊單階 draft 退回 concept 一隻） */
export function stagesOf(draft) {
  if (draft.family?.stages?.length) {
    return draft.family.stages.map((s) => ({ id: s.id, stage: s.stage }));
  }
  if (draft.concept) return [{ id: draft.id, stage: draft.concept.stage ?? 1 }];
  return [];
}

/** 讀預設指示 inbox（用戶落生成指示 + 參考圖）；冇就 null */
export function readInbox() {
  if (!existsSync(INBOX_FILE)) return null;
  try {
    return JSON.parse(readFileSync(INBOX_FILE, "utf8"));
  } catch {
    return null;
  }
}

/** 清空 inbox（用完即清，避免方向／參考圖殘留落之後每一隻） */
export function clearInbox() {
  try {
    if (existsSync(INBOX_FILE)) unlinkSync(INBOX_FILE);
  } catch {
    // 清唔到就算，唔阻 pipeline
  }
}
