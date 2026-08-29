// 系統二 Step5：Gemini client（node，graceful）。
// 只喺有 GEMINI_API_KEY 且 pipeline --live 先會真 call；dry-run / 冇 key 一律唔會出網。
// 任何錯誤都 throw 俾上層 catch → 退回 mock，唔會炸停 pipeline。
//
// ⚠️ 圖生成（generateImage）會燒 credits：按 spirit-asset-pipeline skill 嘅 credits 紀律，
//    真開跑前要用戶批預算。未接實嘅 image endpoint 會 throw，令 art stage 退回 placeholder。

import { getEnv } from "./env.mjs";

const key = getEnv("GEMINI_API_KEY");
export const geminiConfigured = Boolean(key);

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * 文字生成 → 期望回 JSON。低成本、可靠 endpoint（generateContent）。
 * @param prompt 完整 prompt 字串
 * @param opts { model?: string, images?: {mimeType,data(base64)}[] } —— images 令佢做 vision（睇參考圖）
 * @returns 解析後嘅 JSON 物件
 */
export async function generateJson(prompt, opts = {}) {
  if (!key) throw new Error("GEMINI_API_KEY 未設");
  // gemini-flash-latest：永續 alias，唔會撞版本下架 404（實測 1.5-flash 已 404）
  const model = opts.model ?? getEnv("GEMINI_TEXT_MODEL") ?? "gemini-flash-latest";
  // 有參考圖就一齊餵（多模態）：令 LLM 睇餐廳 logo／招牌菜，據此構思聯乘寵物
  const parts = [{ text: prompt }];
  for (const img of opts.images ?? []) {
    if (img?.data) parts.push({ inlineData: { mimeType: img.mimeType ?? "image/jpeg", data: img.data } });
  }
  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) throw new Error("Gemini 回空內容");
  try {
    return JSON.parse(text);
  } catch {
    // 有時會夾 markdown fence，剝走再試
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Gemini 回內容唔係合法 JSON");
  }
}

/**
 * 立繪圖生成（Nano Banana / Gemini image via generateContent）。⚠️ 燒 credits。
 * @param prompt 完整立繪 prompt
 * @param opts { model?, aspectRatio?, refImages?: {mimeType,data(base64)}[] }
 * @returns { mimeType, buffer } 生成圖（未去背）
 */
export async function generateImage(prompt, opts = {}) {
  if (!key) throw new Error("GEMINI_API_KEY 未設");
  // Nano Banana 2（gemini-3.1-flash-image）：多參考圖一致性最好，啱維持成套畫風。
  const model = opts.model ?? getEnv("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-image";
  const parts = [{ text: prompt }];
  for (const ref of opts.refImages ?? []) {
    if (ref?.data) parts.push({ inlineData: { mimeType: ref.mimeType ?? "image/webp", data: ref.data } });
  }

  const call = async (withThinking) => {
    const generationConfig = { responseModalities: ["TEXT", "IMAGE"] };
    if (opts.aspectRatio) generationConfig.imageConfig = { aspectRatio: opts.aspectRatio };
    // Gemini 3 系 reasoning 生圖：thinkingLevel high 對複雜構圖（三階 boss 級細節密度）明顯有幫助
    if (withThinking) generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel ?? "high" };
    return fetch(`${BASE}/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    });
  };

  let res = await call(true);
  if (res.status === 400) {
    // 舊模型／代理未識 thinkingConfig：剝走再試一次（唔好因為呢個 optional 加持炸停成條管線）
    res = await call(false);
  }
  if (!res.ok) throw new Error(`Gemini image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const outParts = data?.candidates?.[0]?.content?.parts ?? [];
  const img = outParts.find((p) => p.inlineData?.data);
  if (!img) throw new Error("Gemini image 回內容冇圖");
  return { mimeType: img.inlineData.mimeType ?? "image/png", buffer: Buffer.from(img.inlineData.data, "base64") };
}

/**
 * 兩步法第二步：風格重繪（style transfer editing——Nano Banana 2 嘅最強項）。
 * 將第一步嘅設計圖＋畫風錨一齊餵入，只換渲染技法、唔郁構圖／設計。⚠️ 燒 credits。
 * @param baseImage {mimeType,data(base64)} 第一步生成嘅設計圖
 * @param styleRefs {mimeType,data(base64)}[] 畫風錨（現有厚塗立繪）
 * @param opts { model?, aspectRatio?, extra?: string }
 */
export async function restyleImage(baseImage, styleRefs, opts = {}) {
  const prompt = [
    "The FIRST image is a character design. The remaining images are the official STYLE GUIDE of a premium collectible set.",
    "REPAINT the first image's character entirely in the style guide's rendering technique: thick layered digital-oil brushwork, soft painted (never inked) edges, deep colour blending, glossy wet specular highlights on food materials, dramatic warm studio lighting with subtle ambient occlusion.",
    "KEEP absolutely unchanged: the character's design, proportions, pose, silhouette, colour palette, equipment and facial identity, and the flat solid background colour.",
    "REMOVE all outlines / inked contour lines and any floating particles, so the result looks hand-painted by the style guide's artist.",
    opts.extra ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return generateImage(prompt, {
    model: opts.model,
    aspectRatio: opts.aspectRatio,
    refImages: [baseImage, ...styleRefs],
  });
}
