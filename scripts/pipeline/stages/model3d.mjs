// Stage: model3d —— 由 2D 立繪生成 GLB（image-to-3D），逐階各一。
// 每階要 public/spirits/full/<stageId>.webp 存在先可真生成（包住 scripts/gen-3d.mjs）；
// 否則寫 placeholder。有 Meshy/Tripo key 且非 dry-run 且有真立繪先會燒 credits。

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { flags } from "../lib/env.mjs";
import { markStage, stagesOf } from "../lib/draft.mjs";

export async function run(ctx) {
  const { draft, dryRun, log } = ctx;
  const dir = join("content/pending-pets/artifacts", draft.id);
  mkdirSync(dir, { recursive: true });

  const stages = stagesOf(draft);
  const byStage = {};
  let realCount = 0;

  for (const st of stages) {
    const webp = `public/spirits/full/${st.id}.webp`;
    if (flags.model3d && !dryRun && existsSync(webp)) {
      const tripoOut = `model-pipeline/gen/tripo/${st.id}.glb`;
      try {
        // 優先 Tripo：Meshy image-to-3D 用 a-pose 會食走手持武器，Tripo align_image 保形保武器。
        // （Meshy 主要留返 rig stage；rig.mjs 會攞 Tripo mesh 去 Meshy rig）
        if (flags.tripo) {
          execSync(`node scripts/gen-3d.mjs --backend=tripo ${st.id}`, { stdio: "inherit" });
        }
        // gen-3d 內部 per-id catch 咗都會 exit 0（例如 Tripo poll transient「fetch failed」），
        // 一定要驗 GLB 真係落咗檔先當成功
        if (!existsSync(tripoOut)) {
          throw new Error("Tripo 冇產出 GLB（credits／網絡），試 Meshy 後備");
        }
        byStage[st.id] = tripoOut;
        realCount++;
        log(`model3d[${st.id}]: Tripo 完成 → ${tripoOut}`);
        continue;
      } catch (e) {
        log(`model3d[${st.id}]: Tripo 失敗（${e.message}）`);
        // Tripo credits 見底時：Meshy 後備（可能蝕武器，好過整條卡 mock）
        if (flags.meshy) {
          try {
            execSync(`node scripts/gen-3d.mjs --backend=meshy ${st.id}`, { stdio: "inherit" });
            const meshyOut = `model-pipeline/gen/meshy/${st.id}.glb`;
            if (!existsSync(meshyOut)) throw new Error("Meshy 亦冇產出 GLB");
            mkdirSync(dirname(tripoOut), { recursive: true });
            copyFileSync(meshyOut, tripoOut);
            byStage[st.id] = tripoOut;
            realCount++;
            log(
              `model3d[${st.id}]: Meshy 後備完成 → ${tripoOut}（由 meshy 複製；武器角色可能缺道具）`
            );
            continue;
          } catch (e2) {
            log(`model3d[${st.id}]: Meshy 後備亦失敗（${e2.message}），退回 placeholder`);
          }
        } else {
          log(`model3d[${st.id}]: 無 Meshy key，退回 placeholder`);
        }
      }
    }
    const placeholder = join(dir, `model3d.${st.id}.json`);
    writeFileSync(
      placeholder,
      JSON.stringify(
        { id: st.id, needs: webp, backends: { meshy: flags.meshy, tripo: flags.tripo },
          note: "MOCK —— 未生成 GLB。真流程需先有去背立繪再跑 gen-3d.mjs。" },
        null, 2
      ) + "\n",
      "utf8"
    );
    byStage[st.id] = placeholder;
    log(`model3d[${st.id}]: placeholder → ${placeholder}`);
  }

  draft.artifacts.model3dByStage = byStage;
  draft.artifacts.model3d = byStage[stages[0]?.id] ?? null; // 向下相容
  markStage(draft, "model3d", {
    status: realCount === stages.length && stages.length ? "done" : realCount ? "partial" : "mock",
    mode: realCount ? "real" : "mock",
    detail: `${realCount}/${stages.length} 階真生成`,
  });
  return draft;
}
