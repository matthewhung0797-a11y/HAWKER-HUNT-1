// Stage: art —— 2D key art（全身立繪，去背 webp），逐階各一。
// 有 GEMINI_API_KEY 且 --live → 真圖生成（Nano Banana）→ 去背 → public/spirits/full/<stageId>.webp。
// 三階一致性：stage1 生完做 stage2/3 嘅演化參考圖；再加現有立繪做畫風錨。
// 冇 key / dry-run / 出錯 → 寫 placeholder（graceful，唔炸 pipeline）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flags } from "../lib/env.mjs";
import { markStage } from "../lib/draft.mjs";
import { buildArtPrompt, styleRefsForStage } from "../lib/style-prompt.mjs";
import { generateImage, geminiConfigured } from "../lib/gemini.mjs";
import { cutoutToWebp, iconFromFullWebp } from "../lib/cutout.mjs";

function artifactDir(id) {
  return join("content/pending-pets/artifacts", id);
}

// 讀一張圖做參考（base64）；讀唔到就跳過
function loadRef(path) {
  try {
    if (!existsSync(path)) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp";
    return { mimeType, data: readFileSync(path).toString("base64") };
  } catch {
    return null;
  }
}

export async function run(ctx) {
  const { draft, dryRun, log } = ctx;
  const dir = artifactDir(draft.id);
  mkdirSync(dir, { recursive: true });

  const stages = draft.family?.stages ?? (draft.concept ? [{ id: draft.id, stage: 1, ...draft.concept }] : []);
  // 聯乘：餐廳參考圖（logo／吉祥物／招牌菜），令立繪帶品牌視覺
  const partnerRefs = (draft.refImages ?? []).map(loadRef).filter(Boolean);
  const hasPartnerRef = partnerRefs.length > 0;

  const artByStage = {};
  let priorRefPath = null; // 上一階去背圖（真檔）做演化參考
  let realCount = 0;

  for (const st of stages) {
    const imagePrompt = buildArtPrompt(
      { ...st, foodOrigin: draft.family?.foodOrigin ?? draft.concept?.foodOrigin, theme: st.theme },
      st.stage,
      {
        ...(priorRefPath ? { priorStageRef: priorRefPath } : {}),
        hasPartnerRef,
        bodyPlan: st.bodyPlan ?? draft.family?.bodyPlan,
      }
    );
    const targetWebp = `public/spirits/full/${st.id}.webp`;
    // 按階畫風錨：stage 2/3 用戰士／boss 級高細節示範，唔再成條線齋用一階幼體錨
    const stageStyleRefPaths = styleRefsForStage(st.stage);
    const styleRefs = stageStyleRefPaths.map(loadRef).filter(Boolean);

    if (flags.gemini && !dryRun && geminiConfigured) {
      try {
        // 參考圖：餐廳品牌（聯乘）＋當階畫風錨（現有立繪）＋上一階（維持系列演化一致性）
        const refs = [...partnerRefs, ...styleRefs];
        const priorRef = priorRefPath ? loadRef(priorRefPath) : null;
        if (priorRef) refs.push(priorRef);
        const { buffer } = await generateImage(imagePrompt, { refImages: refs, aspectRatio: "3:4" });
        const raw = join(dir, `${st.id}.raw.png`);
        writeFileSync(raw, buffer);
        await cutoutToWebp(buffer, targetWebp);
        // 圖鑑 icon（cream 底 512²）——SpiritIcon 已捕獲讀 /spirits/<id>.webp，缺就爛圖
        await iconFromFullWebp(targetWebp, `public/spirits/${st.id}.webp`);
        artByStage[st.id] = targetWebp;
        priorRefPath = targetWebp;
        realCount++;
        log(`art[${st.id}]: 真圖生成＋去背＋圖鑑 icon → ${targetWebp}`);
        continue;
      } catch (e) {
        log(`art[${st.id}]: 真圖失敗（${e.message}），退回 placeholder`);
      }
    }

    // placeholder（dry-run / 冇 key / 出錯）
    const spec = {
      id: st.id,
      stage: st.stage,
      prompt: imagePrompt,
      styleRefs: stageStyleRefPaths,
      priorStageRef: priorRefPath,
      targetWebp,
      note: "MOCK placeholder —— 未有真圖，publish 前需真生成或人手補圖。",
    };
    const placeholder = join(dir, `art.${st.id}.json`);
    writeFileSync(placeholder, JSON.stringify(spec, null, 2) + "\n", "utf8");
    artByStage[st.id] = placeholder;
    priorRefPath = targetWebp; // 下一階仍以「目標圖」為參考路徑（真流程會存在）
    log(`art[${st.id}]: placeholder → ${placeholder}`);
  }

  draft.artifacts.artByStage = artByStage;
  draft.artifacts.art = artByStage[stages[0]?.id] ?? null; // 向下相容
  markStage(draft, "art", {
    status: realCount === stages.length && stages.length ? "done" : realCount ? "partial" : "mock",
    mode: realCount ? "gemini" : "mock",
    detail: `${realCount}/${stages.length} 階真圖`,
  });
  return draft;
}
