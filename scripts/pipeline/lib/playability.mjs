// 上線可玩硬閘：真 GLB + icon + 已校準 facing-lock（唔接受 pipeline default / mock）
// ＋每階特殊技暫時最多 2 招（見 stages/skills.mjs MAX_SKILLS_PER_STAGE）

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_SKILLS_PER_STAGE } from "./skill-limits.mjs";

const VALID_YAWS = new Set([0, Math.PI / 2, -Math.PI / 2, Math.PI]);

function nearYaw(a, b) {
  return Math.abs(a - b) < 1e-9 || Math.abs(Math.abs(a - b) - 2 * Math.PI) < 1e-9;
}

export function isAllowedModelYaw(yaw) {
  if (typeof yaw !== "number" || Number.isNaN(yaw)) return false;
  for (const v of VALID_YAWS) if (nearYaw(yaw, v)) return true;
  return false;
}

/** 已校準嘅 facing-lock（唔計 pipeline 占位） */
export function hasVerifiedFacingLockInSpeciesSource(speciesTs, speciesId) {
  if (!speciesTs || !speciesId) return false;
  const needle = `id: "${speciesId}"`;
  const idx = speciesTs.indexOf(needle);
  if (idx < 0) return false;
  const win = speciesTs.slice(idx, idx + 1200);
  if (!/facing-lock:\s*\d{4}-\d{2}-\d{2}/.test(win)) return false;
  if (/pipeline default/i.test(win) || /\bverify\b/i.test(win)) return false;
  return /modelYaw:\s*/.test(win);
}

export function hasVerifiedFacingLockOnDraft(draft, speciesId) {
  const lock = draft?.facingLockByStage?.[speciesId];
  if (!lock?.verified) return false;
  return isAllowedModelYaw(Number(lock.modelYaw));
}

/**
 * 檢查 draft 係咪有齊「可入最終待審」嘅真 3D（未要求 facing——facing 喺批准前再查）。
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function checkReal3dReady(draft) {
  const errors = [];
  const list = draft?.speciesList ?? (draft?.species ? [draft.species] : []);
  if (list.length < 3) errors.push(`需要三階 speciesList（而家 ${list.length}）`);

  for (const sp of list) {
    const fin = draft?.finalizeByStage?.[sp.id];
    if (fin?.mock) errors.push(`${sp.id}: finalize 仍係 mock`);
    const url = sp.modelUrl ?? fin?.modelUrl ?? null;
    if (!url) {
      errors.push(`${sp.id}: modelUrl 為 null`);
      continue;
    }
    const glbPath = url.startsWith("/") ? `public${url}` : url;
    const artifact = draft?.artifacts?.finalByStage?.[sp.id];
    const candidates = [glbPath, artifact].filter(Boolean);
    if (!candidates.some((p) => existsSync(resolve(p)))) {
      errors.push(`${sp.id}: 搵唔到 GLB（試過 ${candidates.join(", ")}）`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 批准／publish 完整可玩檢查。
 * @param {{ draft?: object, speciesTs?: string, requireFacing?: boolean }} opts
 */
export function checkPlayability(draft, opts = {}) {
  const requireFacing = opts.requireFacing !== false;
  const speciesTs =
    opts.speciesTs ??
    (existsSync("src/content/species.ts")
      ? readFileSync("src/content/species.ts", "utf8")
      : "");
  const errors = [];
  const list = draft?.speciesList ?? (draft?.species ? [draft.species] : []);
  if (!list.length) errors.push("draft 冇 speciesList");

  const r3 = checkReal3dReady(draft);
  errors.push(...r3.errors);

  for (const sp of list) {
    const full = `public/spirits/full/${sp.id}.webp`;
    const icon = `public/spirits/${sp.id}.webp`;
    const artAlt = draft?.artifacts?.artByStage?.[sp.id];
    if (!existsSync(full) && !(artAlt && existsSync(artAlt))) {
      errors.push(`${sp.id}: 缺立繪 ${full}`);
    }
    if (!existsSync(icon)) {
      errors.push(`${sp.id}: 缺 icon ${icon}`);
    }
    const nSkills = Array.isArray(sp.skills) ? sp.skills.length : 0;
    if (nSkills > MAX_SKILLS_PER_STAGE) {
      errors.push(
        `${sp.id}: 特殊技 ${nSkills} 招超過暫時上限 ${MAX_SKILLS_PER_STAGE}（普攻另計；唔好兩攻再 append 治療）`
      );
    }
    if (requireFacing) {
      const onDraft = hasVerifiedFacingLockOnDraft(draft, sp.id);
      const onSpecies = hasVerifiedFacingLockInSpeciesSource(speciesTs, sp.id);
      if (!onDraft && !onSpecies) {
        errors.push(
          `${sp.id}: 未有已校準 facing-lock（要 diag-facing-calibrate + apply-facing-lock，唔接受 pipeline default）`
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** 由 pets row（Supabase）砌返最少 draft 形狀做閘 */
export function draftLikeFromPetRow(row) {
  const def = row?.definition;
  const speciesList = def?.speciesList ?? (def && !def.speciesList && def.id ? [def] : null);
  const artifacts = row?.artifacts ?? {};
  return {
    id: row?.id,
    speciesList: speciesList ?? [],
    species: speciesList?.[0],
    artifacts,
    finalizeByStage: Object.fromEntries(
      (speciesList ?? []).map((sp) => [
        sp.id,
        {
          modelUrl: sp.modelUrl ?? null,
          mock: !sp.modelUrl,
          modelYaw: sp.modelYaw,
        },
      ])
    ),
    facingLockByStage: row?.manifest?.facingLockByStage ?? artifacts?.facingLockByStage ?? {},
  };
}
