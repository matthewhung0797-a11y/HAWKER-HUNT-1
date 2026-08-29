// Stage: finalize —— 後處理模型（merge+Draco 壓縮）＋決定 species 旗標，逐階各一。
// 每階有 rig 產物（anim/<stageId>/idle.glb）且非 dry-run → 包住 scripts/finalize-models.mjs
// （輸出 public/models/<stageId>.glb）。mock 就落建議預設 + 標明要 diag-yaw-sweep 校準。
// 見 .cursor/skills/spirit-3d-models/SKILL.md。

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { flags } from "../lib/env.mjs";
import { markStage, stagesOf } from "../lib/draft.mjs";

// modelHeightM 決定螢幕上高度（SpiritModel 會正規化到呢個值）。手工寵物按階遞增，
// 唔跟就會同同階對手大細唔一致（生成寵物之前硬寫 0.3 → 2/3 階偏細）。查表對齊慣例：
// 1 階幼體 ~0.3、2 階武士 ~0.5、3 階終形 ~0.65。
function heightForStage(stage) {
  return { 1: 0.3, 2: 0.5, 3: 0.65 }[stage] ?? 0.3;
}

export async function run(ctx) {
  const { draft, dryRun, log } = ctx;
  const stages = stagesOf(draft);

  const finalizeByStage = {};      // 每階 species 旗標（俾 assemble）
  const finalPathByStage = {};     // 每階 GLB 源路徑（俾 publish 搬）
  let realCount = 0;

  for (const st of stages) {
    const animDir = `model-pipeline/gen/anim/${st.id}`;
    const staticMesh = `model-pipeline/gen/tripo/${st.id}.glb`;
    const out = `public/models/${st.id}.glb`;
    const canReal = flags.model3d && !dryRun && existsSync(`${animDir}/idle.glb`);
    // rig stage 記低邊個骨架路：Meshy = fullRig（真手腳動），Tripo = rigLite（簡骨架＋程序化補動）
    const rigMode = draft.artifacts?.rigModeByStage?.[st.id];
    const isMeshy = rigMode === "meshy";
    if (canReal) {
      try {
        execSync(`node scripts/finalize-models.mjs ${st.id}`, { stdio: "inherit" });
        finalPathByStage[st.id] = out;
        finalizeByStage[st.id] = {
          modelUrl: `/models/${st.id}.glb`,
          animated: true,
          // Meshy fullRig：唔標 rigLite（SpiritModel 直接播 clip，battle 手腳動幅度大、唔硬）
          // Tripo rigLite：runtime stripRoot 避免 root motion 撞 battle lookAt + 程序化補動
          ...(isMeshy ? {} : { rigLite: true }),
          // 朝向：Meshy 由 -90° 旋轉檔 rig，輸出面向 -X → 要 +π/2 修正；Tripo 慣例 -π/2。
          // ⚠️ 兩者都要 diag-yaw-sweep 校準確認，唔好當呢個係最終值
          modelYaw: isMeshy ? Math.PI / 2 : -Math.PI / 2,
          modelHeightM: heightForStage(st.stage),
          needsYawVerification: true,
        };
        realCount++;
        log(`finalize[${st.id}]: ${isMeshy ? "Meshy fullRig" : "Tripo rigLite"} → ${out}（modelYaw 待校準）`);
        continue;
      } catch (e) {
        log(`finalize[${st.id}]: 失敗（${e.message}），試靜態網格保底`);
      }
    }
    // ── rig 失敗 / 冇動畫，但有 Tripo 靜態網格 → 保底做靜態 3D（Draco 壓縮）──
    // （SKILL 決策樹：圓身無四肢 blob rig 失敗，靜態網格＋程序化 idle 好過跌返 2D）
    if (!dryRun && existsSync(staticMesh)) {
      try {
        execSync(
          `npx gltf-transform optimize "${staticMesh}" "${out}" --compress draco --texture-compress webp --texture-size 1024 --no-flatten --no-join --simplify false`,
          { stdio: "inherit" }
        );
        finalPathByStage[st.id] = out;
        finalizeByStage[st.id] = {
          modelUrl: `/models/${st.id}.glb`,
          animated: false, // 靜態：SpiritModel 仍會程序化 idle 浮動托底
          rigLite: false,
          modelYaw: -Math.PI / 2,
          modelHeightM: heightForStage(st.stage),
          needsYawVerification: true,
          static: true,
        };
        realCount++;
        log(`finalize[${st.id}]: rig 缺 → 靜態網格保底 → ${out}`);
        continue;
      } catch (e) {
        log(`finalize[${st.id}]: 靜態保底都失敗（${e.message}），落 mock 旗標`);
      }
    } else {
      log(`finalize[${st.id}]: 無 rig 亦無靜態網格，落 mock 旗標`);
    }
    // mock（或 real 失敗）：落建議預設，publish 前要人手／diag 校準
    finalizeByStage[st.id] = {
      modelUrl: null,
      animated: false,
      rigLite: true,
      modelYaw: -Math.PI / 2,
      modelHeightM: heightForStage(st.stage),
      needsYawVerification: true,
      mock: true,
    };
  }

  draft.finalizeByStage = finalizeByStage;
  draft.finalize = finalizeByStage[stages[0]?.id] ?? {}; // 向下相容 alias
  draft.artifacts.finalByStage = finalPathByStage;
  draft.artifacts.final = finalPathByStage[stages[0]?.id] ?? null;
  markStage(draft, "finalize", {
    status: realCount === stages.length && stages.length ? "done" : realCount ? "partial" : "mock",
    mode: realCount ? "real" : "mock",
    detail: `${realCount}/${stages.length} 階真 finalize`,
  });
  return draft;
}
