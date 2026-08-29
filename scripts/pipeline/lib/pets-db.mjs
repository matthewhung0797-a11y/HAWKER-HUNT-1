// 系統二 node 腳本：將 pending pet draft 鏡射落 Supabase pets 表（service role）。
// 同 src/lib/pipeline/pets-repo.ts 對齊 schema。未配置就 graceful skip（唔 throw）。

import { getEnv } from "./env.mjs";

const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

export const petsDbConfigured = Boolean(url && serviceKey);

function rowFromDraft(draft) {
  const c = draft.concept;
  const fam = draft.family;
  // definition 存整條三階線（speciesList）先算完整；冇就退返單一 species
  const definition = draft.speciesList
    ? { family: fam ?? null, speciesList: draft.speciesList }
    : draft.species ?? null;
  return {
    id: draft.id,
    source: "generated",
    status: draft.status,
    kind: draft.kind ?? null,
    partner_label: draft.partnerLabel ?? null,
    exclusive: Boolean(draft.exclusive),
    series_id: fam?.seriesId ?? c?.seriesId ?? null,
    stage: c?.stage ?? 1,
    element: fam?.element ?? c?.element ?? null,
    rarity: c?.rarity ?? null,
    name: c?.name ?? null,
    definition,
    instructions: draft.instructions ?? null,
    manifest: draft.manifest ?? {},
    artifacts: draft.artifacts ?? {},
    decision: draft.decision ?? null,
    telegram: { ...(draft.telegram ?? {}), poolStatus: draft.poolStatus ?? null },
    updated_at: new Date().toISOString(),
  };
}

/** upsert 一個 draft 落 pets 表；回 {ok, skipped}。動態 import supabase，缺套件都唔炸。 */
export async function upsertPetDraft(draft) {
  if (!petsDbConfigured) return { ok: false, skipped: true };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb.from("pets").upsert(rowFromDraft(draft), { onConflict: "id" });
    if (error) {
      console.warn(`  [pets-db] upsert 失敗：${error.message}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn(`  [pets-db] 略過（${e.message}）`);
    return { ok: false };
  }
}

/** 讀單一 pets row（publish 前同步後台 facing-lock 用） */
export async function getPet(id) {
  if (!petsDbConfigured || !id) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.from("pets").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.warn(`  [pets-db] getPet 失敗：${error.message}`);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.warn(`  [pets-db] 略過（${e.message}）`);
    return null;
  }
}

/**
 * 將後台寫入 pets 表嘅 facingLockByStage／speciesList.modelYaw 同步入 draft。
 * Vercel facing-lock API 唔會 commit 落 auto-pet 分支——publish 前一定要 hydrate。
 */
export async function hydrateDraftFacingFromPets(draft) {
  const row = await getPet(draft.id);
  if (!row) return { draft, hydrated: false, reason: "no-row" };

  const locks =
    row.manifest?.facingLockByStage ??
    row.artifacts?.facingLockByStage ??
    null;
  const def = row.definition;
  const dbList = Array.isArray(def?.speciesList) ? def.speciesList : null;

  let changed = false;
  if (locks && typeof locks === "object") {
    draft.facingLockByStage = { ...(draft.facingLockByStage ?? {}), ...locks };
    draft.manifest = {
      ...(draft.manifest ?? {}),
      facingLockByStage: draft.facingLockByStage,
    };
    draft.artifacts = {
      ...(draft.artifacts ?? {}),
      facingLockByStage: draft.facingLockByStage,
    };
    changed = true;
  }

  if (dbList?.length) {
    const byId = Object.fromEntries(dbList.map((s) => [s.id, s]));
    if (Array.isArray(draft.speciesList)) {
      draft.speciesList = draft.speciesList.map((s) => {
        const db = byId[s.id];
        const lock = draft.facingLockByStage?.[s.id];
        if (!db && !lock) return s;
        return {
          ...s,
          ...(db?.modelYaw != null ? { modelYaw: db.modelYaw } : {}),
          ...(lock?.verified && lock.modelYaw != null
            ? { modelYaw: lock.modelYaw }
            : {}),
          ...(db?.modelUrl ? { modelUrl: db.modelUrl } : {}),
          ...(db?.animated != null ? { animated: db.animated } : {}),
          ...(db?.rigLite != null ? { rigLite: db.rigLite } : {}),
        };
      });
      draft.species = draft.speciesList[0];
      changed = true;
    }
  }

  // 後台已批准但分支 draft 可能仍係 awaiting-approval
  if (row.status === "approved" || row.status === "published") {
    if (draft.status !== row.status) {
      draft.status = row.status;
      changed = true;
    }
    if (row.decision && !draft.decision) {
      draft.decision = row.decision;
      changed = true;
    }
  }

  return { draft, hydrated: changed, reason: changed ? "ok" : "noop" };
}

/** 標記狀態（publish 後 → published） */
export async function setPetStatus(id, status) {
  if (!petsDbConfigured) return false;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb
      .from("pets")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.warn(`  [pets-db] setStatus 失敗：${error.message}`);
    return !error;
  } catch (e) {
    console.warn(`  [pets-db] 略過（${e.message}）`);
    return false;
  }
}
