// Stage: rig —— rig + 7 套動畫（idle/walk/attack/skill/hit/down/victory），逐階各一。
// 每階要 model-pipeline/gen/tripo/<stageId>.glb 存在先可 rig；否則寫 placeholder。
//
// 路由（解決「攻擊硬邦邦」＋「唔想全部人形」）：
//   1. Meshy auto-rig 優先 —— 直立雙足形態（bodyPlan.rig==="meshy"）先 -90° 旋轉臨時檔
//      （Tripo 正面 +X → Meshy pose-estimation 要 +Z 先認到人形），再 Meshy rig。
//      成功 = fullRig，battle 有真手腳動作（idle/attack/skill…幅度大、唔硬）。
//   2. Meshy 失敗（422 非人形／pose 認唔到）→ 退 Tripo rig（rigLite，簡骨架＋程序化補動）。
//   3. bodyPlan.rig==="static"（圓身 blob）或兩者皆敗 → 唔 rig，交 finalize 做靜態網格。
// 記 draft.artifacts.rigModeByStage[id] = "meshy" | "tripo"，finalize 據此落正確旗標＋modelYaw。
// 有對應 key 且非 dry-run 先會燒 credits。

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { flags } from "../lib/env.mjs";
import { markStage, stagesOf } from "../lib/draft.mjs";
import { bodyPlanOf } from "../lib/style-prompt.mjs";

/** Meshy rig 一階：-90° 旋轉臨時檔 → rig-animate --src=tripo。成功回 true。 */
function tryMeshyRig(id, genGlb, log) {
  const rot = `model-pipeline/gen/tripo/${id}.rot.glb`;
  try {
    execSync(`node scripts/rotate-glb.mjs "${genGlb}" "${rot}" -90`, { stdio: "inherit" });
    execSync(`node scripts/rig-animate.mjs --src=tripo --glb="${rot}" ${id}`, { stdio: "inherit" });
    return existsSync(`model-pipeline/gen/anim/${id}/idle.glb`);
  } catch (e) {
    log(`rig[${id}]: Meshy rig 失敗（${e.message}）`);
    return false;
  }
}

/** Tripo rig 一階：tripo-rig-animate。成功回 true。 */
function tryTripoRig(id, log) {
  try {
    execSync(`node scripts/tripo-rig-animate.mjs ${id}`, { stdio: "inherit" });
    return existsSync(`model-pipeline/gen/anim/${id}/idle.glb`);
  } catch (e) {
    log(`rig[${id}]: Tripo rig 失敗（${e.message}）`);
    return false;
  }
}

export async function run(ctx) {
  const { draft, dryRun, log } = ctx;
  const dir = join("content/pending-pets/artifacts", draft.id);
  mkdirSync(dir, { recursive: true });

  const stages = stagesOf(draft);
  const byStage = {};
  const rigMode = {}; // { [id]: "meshy" | "tripo" }
  let realCount = 0;

  for (const st of stages) {
    const genGlb = `model-pipeline/gen/tripo/${st.id}.glb`;
    const plan = bodyPlanOf(st.bodyPlan ?? draft.family?.bodyPlan);
    const preferMeshy = plan.rig === "meshy"; // static（blob）唔行 rig，直接落 placeholder 交 finalize
    let mode = null;

    if (!dryRun && existsSync(genGlb) && preferMeshy) {
      // ⚠️ 清走上次殘留嘅 anim 輸出：tryMeshy/tryTripo 靠 existsSync(idle.glb) 判斷成功，
      // 若上次退咗 Tripo 留低 idle.glb，今次 Meshy 422 會被誤判成「Meshy 成功」。
      // rig-animate/tripo-rig 會由 tasks 快取重下載（唔會重收費）。
      rmSync(`model-pipeline/gen/anim/${st.id}`, { recursive: true, force: true });
      // 1) Meshy 優先（fullRig）
      if (flags.meshy && tryMeshyRig(st.id, genGlb, log)) mode = "meshy";
      // 2) 退 Tripo（rigLite）
      if (!mode && flags.tripo && tryTripoRig(st.id, log)) mode = "tripo";
    }

    if (mode) {
      const out = `model-pipeline/gen/anim/${st.id}`;
      byStage[st.id] = out;
      rigMode[st.id] = mode;
      realCount++;
      log(`rig[${st.id}]: ${mode === "meshy" ? "Meshy fullRig" : "Tripo rigLite"} 完成 → ${out}/*.glb`);
      continue;
    }

    // 冇 rig（blob／無 key／dry-run／兩者皆敗）→ placeholder（finalize 會試靜態網格保底）
    const placeholder = join(dir, `rig.${st.id}.json`);
    writeFileSync(
      placeholder,
      JSON.stringify(
        {
          id: st.id,
          bodyPlan: plan.label,
          actions: ["idle", "walk", "attack", "skill", "hit", "down", "victory"],
          note:
            plan.rig === "static"
              ? "STATIC —— 圓身 blob 唔上 rig（rig 必敗），finalize 會做靜態網格＋程序化托底。"
              : "MOCK —— 未 rig。真流程需先跑 model3d(gen-3d) 再本 stage（Meshy→Tripo）。",
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    byStage[st.id] = placeholder;
    log(`rig[${st.id}]: placeholder（${plan.rig === "static" ? "blob 靜態路" : "未 rig"}）→ ${placeholder}`);
  }

  draft.artifacts.riggedByStage = byStage;
  draft.artifacts.rigModeByStage = rigMode; // finalize 讀呢個決定 fullRig / rigLite 旗標
  draft.artifacts.rigged = byStage[stages[0]?.id] ?? null; // 向下相容
  const meshyN = Object.values(rigMode).filter((m) => m === "meshy").length;
  markStage(draft, "rig", {
    status: realCount === stages.length && stages.length ? "done" : realCount ? "partial" : "mock",
    mode: realCount ? "real" : "mock",
    detail: `${realCount}/${stages.length} 階真 rig（Meshy ${meshyN}／Tripo ${realCount - meshyN}）`,
  });
  return draft;
}
