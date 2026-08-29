// 畫風配方 A/B test：驗證新 prompt 配方（正面框架＋關係指令＋thinking high）
// 同兩步重繪法（restyleImage）邊個救到 Nano Banana 2 嘅清線 anime 漂移。
// A＝舊配方產物（已存在：content/pending-pets/artifacts/styletest-1/*.raw.png）
// B＝新配方一 shot 生成
// C＝兩步法：攞 A 嘅設計，用畫風錨重繪
// 輸出 → test-shots/styletest/，肉眼對比。⚠️ 每張圖燒少量 Gemini credits（4 張）。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildArtPrompt, styleRefsForStage } from "./pipeline/lib/style-prompt.mjs";
import { generateImage, restyleImage, geminiConfigured } from "./pipeline/lib/gemini.mjs";

if (!geminiConfigured) {
  console.error("GEMINI_API_KEY 未設，冇得測");
  process.exit(1);
}

const OUT = "test-shots/styletest";
mkdirSync(OUT, { recursive: true });

const draft = JSON.parse(readFileSync("content/pending-pets/styletest-1.json", "utf8"));
const stages = draft.family.stages;

function loadRef(path) {
  if (!existsSync(path)) return null;
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : "image/webp";
  return { mimeType, data: readFileSync(path).toString("base64") };
}

// 測二、三階（漂移最嚴重嘅兩階）
for (const st of stages.filter((s) => s.stage >= 2)) {
  const styleRefs = styleRefsForStage(st.stage).map(loadRef).filter(Boolean);
  console.log(`\n== ${st.id}（stage ${st.stage}，refs ×${styleRefs.length}）==`);

  // B：新配方一 shot
  try {
    const prompt = buildArtPrompt(
      { ...st, foodOrigin: draft.family.foodOrigin, theme: st.theme },
      st.stage,
      { bodyPlan: st.bodyPlan }
    );
    const { buffer } = await generateImage(prompt, { refImages: styleRefs, aspectRatio: "3:4" });
    writeFileSync(join(OUT, `${st.id}.B-newprompt.png`), buffer);
    console.log(`B（新配方一 shot）✔ → ${OUT}/${st.id}.B-newprompt.png`);
  } catch (e) {
    console.log(`B 失敗: ${e.message}`);
  }

  // C：兩步法——攞舊配方嘅設計圖（A）重繪做厚塗
  try {
    const base = loadRef(`content/pending-pets/artifacts/styletest-1/${st.id}.raw.png`);
    if (!base) throw new Error("搵唔到舊 raw 圖");
    const { buffer } = await restyleImage(base, styleRefs, { aspectRatio: "3:4" });
    writeFileSync(join(OUT, `${st.id}.C-restyle.png`), buffer);
    console.log(`C（兩步重繪）✔ → ${OUT}/${st.id}.C-restyle.png`);
  } catch (e) {
    console.log(`C 失敗: ${e.message}`);
  }
}

console.log("\n完成——用 Read 工具肉眼對比 test-shots/styletest/ 同舊 raw 圖");
