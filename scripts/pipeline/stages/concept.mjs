// Stage: concept —— 生成一條「完整三階系列」概念（seriesId、五行五味、食物原型，
// 加三階各自嘅名/主題/技能點子）。有 GEMINI_API_KEY 且非 dry-run → 真 LLM（Step5 已備 prompt，
// call 未接）；否則由本地 family template 出 deterministic mock，令下游 stage 照跑。
//
// 三大保障（Step 3）：
//   1. 唯一性守衛：排除同現有 species / 已生成 pets 撞嘅 seriesId / 食物 / 名（相似得，相同唔得）
//   2. 食物池將盡偵測：可用 template 少過門檻就出警告
//   3. 後備策略建議：池乾塘時建議轉 fusion / 地區變體 / 特別版，令 IP 可持續生產

import { existsSync, readFileSync } from "node:fs";
import { flags } from "../lib/env.mjs";
import { markStage, listDrafts } from "../lib/draft.mjs";
import { buildConceptPrompt, readExistingFoods, BODY_PLAN_ROTATION, MYTHIC_ROTATION } from "../lib/style-prompt.mjs";
import { generateJson, geminiConfigured } from "../lib/gemini.mjs";

/** 讀一張參考圖做 base64（畀 Gemini vision）；讀唔到就 null */
function loadRefImage(path) {
  try {
    if (!path || !existsSync(path)) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { mimeType, data: readFileSync(path).toString("base64") };
  } catch {
    return null;
  }
}

// 每條 = 一個完整三階系列（mock 用；真流程由 LLM 參考現有 53 隻自由構思三階）。
// 五行↔五味↔食物盡量對齊 species.ts 慣例。stage1 命名細細可愛、stage2 武者、stage3 王者。
const FAMILIES = [
  {
    seriesId: "nasi-lemak",
    element: "earth", flavor: "salty",
    foodOrigin: { en: "Nasi Lemak", zh: "椰漿飯" },
    stages: [
      { id: "riceball-nyonya", name: { en: "Nyonya Riceball", zh: "椰香飯團仔" },
        theme: "圓潤椰香飯團身、頭頂一片班蘭葉、腰纏江魚仔腰帶，大眼卡通厚塗",
        skillIdeas: ["江魚仔飛鏢", "椰香回復"] },
      { id: "sambal-warrior", name: { en: "Sambal Warrior", zh: "叁巴武士" },
        theme: "飯團身披蕉葉戰袍、手持叁巴辣醬刀、頭盔綴煎蛋，威武開揚企姿",
        skillIdeas: ["叁巴辣醬爆擊", "花生脆甲"] },
      { id: "nasi-lemak-king", name: { en: "Nasi Lemak King", zh: "椰漿飯王" },
        theme: "巨型飯山王座、蕉葉披風、雙手江魚仔長戟，王者氣派",
        skillIdeas: ["椰王震盪", "蕉葉守護"] },
    ],
  },
  {
    seriesId: "hokkien-mee",
    element: "fire", flavor: "salty",
    foodOrigin: { en: "Hokkien Mee", zh: "福建蝦麵" },
    stages: [
      { id: "prawn-noodlet", name: { en: "Prawn Noodlet", zh: "蝦麵仔" },
        theme: "細團黃麵、額前一隻細鮮蝦、圓潤大眼，卡通厚塗",
        skillIdeas: ["蝦湯灌頂", "麵條纏繞"] },
      { id: "wok-hei-monk", name: { en: "Wok Hei Monk", zh: "鑊氣麵僧" },
        theme: "黃麵纏身如袈裟、手持鑊鏟、鑊氣繚繞，開揚企姿",
        skillIdeas: ["鑊氣掃蕩", "豬油渣護盾"] },
      { id: "hokkien-mee-god", name: { en: "Hokkien Mee God", zh: "福建麵神" },
        theme: "巨鑊光環、雙手鑊鏟長槍、鮮蝦戰甲，神級氣場",
        skillIdeas: ["爆炒鑊神", "蝦膏烈焰"] },
    ],
  },
  {
    seriesId: "fishball-noodle",
    element: "water", flavor: "salty",
    foodOrigin: { en: "Fishball Noodle", zh: "魚圓麵" },
    stages: [
      { id: "fishball-bouncer", name: { en: "Fishball Bouncer", zh: "魚蛋彈彈" },
        theme: "白胖魚蛋身、彈彈跳、手抱一串竹籤魚蛋，圓潤大眼卡通",
        skillIdeas: ["彈射魚蛋", "彈牙硬化"] },
      { id: "fishball-fencer", name: { en: "Fishball Fencer", zh: "魚蛋劍客" },
        theme: "魚蛋身佩竹籤細劍、醋辣披肩、開揚企姿，靈巧俐落",
        skillIdeas: ["竹籤連刺", "醋辣噴濺"] },
      { id: "fishball-tycoon", name: { en: "Fishball Tycoon", zh: "魚蛋大亨" },
        theme: "巨魚蛋身、雙手竹籤長矛、湯碗王座，圓潤威嚴",
        skillIdeas: ["魚蛋風暴", "魚湯回春"] },
    ],
  },
  {
    seriesId: "wanton-mee",
    element: "metal", flavor: "salty",
    foodOrigin: { en: "Wanton Mee", zh: "雲吞麵" },
    stages: [
      { id: "wanton-pup", name: { en: "Wanton Pup", zh: "雲吞仔" },
        theme: "細雲吞頭、麵條圍巾、圓潤大眼，卡通厚塗",
        skillIdeas: ["雲吞投擲", "麵條彈鞭"] },
      { id: "charsiu-blade", name: { en: "Char Siu Blade", zh: "叉燒刀客" },
        theme: "雲吞頭盔、麵條披肩、手持叉燒刀，威風武士造型，開揚企姿",
        skillIdeas: ["叉燒斬", "黑醋封喉"] },
      { id: "wanton-mee-shogun", name: { en: "Wanton Mee Shogun", zh: "雲吞麵將軍" },
        theme: "雲吞戰盔、雙叉燒刀、麵條戰旗披風，將軍氣勢",
        skillIdeas: ["千麵斬", "叉燒護體"] },
    ],
  },
];

/** 後備生產策略（食物池乾塘時建議轉呢啲方向，令 IP 可持續產出） */
const FALLBACK_STRATEGIES = [
  { kind: "fusion", label: "融合菜", examples: ["叻沙意粉", "咖喱薯條", "辣椒蟹漢堡", "沙嗲披薩"] },
  { kind: "regional", label: "地區變體", examples: ["檳城版", "怡保版", "新山版", "馬六甲版"] },
  { kind: "special", label: "特別版/節慶限定", examples: ["新年撈起", "中秋月餅", "端午糉", "聖誕火雞飯"] },
  { kind: "drinks-dessert", label: "飲品/甜品線延伸", examples: ["美祿恐龍", "斑蘭蛋糕", "紅豆冰", "薏米水"] },
  { kind: "partner", label: "商店聯乘限定", examples: ["某店招牌菜獨佔寵"] },
];

const ELEMENTS = ["metal", "wood", "water", "fire", "earth"];
const FLAVORS = ["bitter", "sour", "salty", "spicy", "sweet"];

/** 驗證 LLM 回嘅 family JSON；合格回 FAMILIES-shape，否則 null（→ 退 mock） */
function validateLlmFamily(o) {
  if (!o || typeof o !== "object") return null;
  const kebab = (s) => typeof s === "string" && /^[a-z0-9-]+$/.test(s);
  const loc = (x) => x && typeof x.en === "string" && typeof x.zh === "string";
  if (!kebab(o.seriesId) || !loc(o.foodOrigin)) return null;
  if (!ELEMENTS.includes(o.element) || !FLAVORS.includes(o.flavor)) return null;
  if (!Array.isArray(o.stages) || o.stages.length !== 3) return null;
  const stages = [];
  for (let i = 0; i < 3; i++) {
    const s = o.stages[i];
    if (!s || !kebab(s.id) || !loc(s.name)) return null;
    stages.push({
      id: s.id,
      name: s.name,
      description: loc(s.description) ? s.description : undefined,
      theme: typeof s.theme === "string" ? s.theme : "",
      skillIdeas: Array.isArray(s.skillIdeas) ? s.skillIdeas.filter((x) => typeof x === "string") : [],
    });
  }
  return { seriesId: o.seriesId, element: o.element, flavor: o.flavor, foodOrigin: o.foodOrigin, stages };
}

/** deterministic：由 id 字串 hash 揀一個 index（同一 id 永遠出同一隻） */
function hashPick(id, len) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % Math.max(1, len);
}

/** 形態輪替：每隻換一個物種形態（獸/龍/鳥…）防同質化，又避開最近生成過嗰個。
 *  以現有 roster 數量做輪替基準（roster 愈大形態循環行得愈遠），加 id hash 打散。 */
function chooseBodyPlan(draft, existing) {
  const rot = BODY_PLAN_ROTATION;
  const n = rot.length;
  // 明確指定（run.mjs --body-plan=<id> / inbox）→ 直接用（founder 可指定形態）
  if (draft.bodyPlanOverride && rot.includes(draft.bodyPlanOverride)) return draft.bodyPlanOverride;
  const recent = listDrafts()
    .filter((d) => d.id !== draft.id && d.family?.bodyPlan)
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    .map((d) => d.family.bodyPlan);
  let idx = ((existing.ids?.length ?? 0) + hashPick(draft.id, n)) % n;
  // 避開最近一次用過嘅形態（連續兩隻唔好同形態）
  if (recent[0] === rot[idx]) idx = (idx + 1) % n;
  return rot[idx];
}

/** 最終形態原型輪替：每隻換一個 stage-3 神話原型（防「隻隻天使」同質化），
 *  同 chooseBodyPlan 一樣以 roster 數量做基準＋id hash 打散＋避開最近一隻。 */
function chooseMythicArchetype(draft, existing) {
  const rot = MYTHIC_ROTATION;
  const n = rot.length;
  const recent = listDrafts()
    .filter((d) => d.id !== draft.id && d.family?.mythicArchetype)
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    .map((d) => d.family.mythicArchetype);
  let idx = ((existing.ids?.length ?? 0) + hashPick(draft.id + "-mythic", n)) % n;
  if (recent[0] === rot[idx]) idx = (idx + 1) % n;
  return rot[idx];
}

/** 唯一性：呢個 family 有冇同現有內容撞（seriesId / 食物 / 任何一階名）。
 *  allowFoodDup=true（聯乘獨家）容許以現有招牌菜做原型，但 id/名仍要獨一無二。 */
function collides(fam, existing, opts = {}) {
  if (existing.ids.includes(fam.seriesId)) return true;
  if (!opts.allowFoodDup) {
    const foods = existing.foods;
    if (foods.includes(fam.foodOrigin.en) || foods.includes(fam.foodOrigin.zh)) return true;
  }
  const names = existing.names;
  for (const s of fam.stages) {
    if (names.includes(s.name.en) || names.includes(s.name.zh)) return true;
    if (existing.ids.includes(s.id)) return true;
  }
  return false;
}

/** 由 family template（或 LLM 出嘅 family）砌 draft.family（三階完整）＋ concept 摘要 */
function buildFamily(draft, fam) {
  const stages = fam.stages.map((s, i) => ({
    id: s.id,
    stage: i + 1,
    name: s.name,
    element: fam.element,
    flavor: fam.flavor,
    rarity: i === 0 ? "common" : i === 1 ? "rare" : "epic",
    foodOrigin: fam.foodOrigin,
    description: s.description ?? {
      en: `Stage ${i + 1} of the ${fam.foodOrigin.en} line.${draft.instructions ? " (guided)" : ""}`.trim(),
      zh: `${fam.foodOrigin.zh}系列第 ${i + 1} 階。${draft.instructions ? "（依指示調整）" : ""}`,
    },
    theme: (s.theme ?? "") + (draft.instructions ? `；額外指示：${draft.instructions}` : ""),
    skillIdeas: s.skillIdeas ?? [],
  }));
  // 進化材料：按系列自動生一個 GameItem（publish --commit 會 append 落 items.ts）
  const evolutionItem = {
    id: `${fam.seriesId}-essence`,
    name: { en: `${fam.foodOrigin.en} Essence`, zh: `${fam.foodOrigin.zh}精華` },
    description: {
      en: `Concentrated essence of ${fam.foodOrigin.en}, fuel for evolution.`,
      zh: `濃縮嘅${fam.foodOrigin.zh}精華，進化嘅燃料。`,
    },
    icon: "star",
  };
  return {
    seriesId: fam.seriesId,
    element: fam.element,
    flavor: fam.flavor,
    foodOrigin: fam.foodOrigin,
    evolutionItemId: evolutionItem.id,
    evolutionItem,
    stages,
  };
}

export async function run(ctx) {
  const { draft, dryRun, log } = ctx;

  // 聯乘獨家：附咗餐廳參考圖／標記 exclusive → 放寬「同現有菜式撞」守衛（容許以佢哋招牌菜做原型）
  const exclusive = Boolean(draft.exclusive);
  const refImages = (draft.refImages ?? []).map(loadRefImage).filter(Boolean);
  const hasRefImages = refImages.length > 0;

  // 唯一性排除清單：抓現有 species 嘅食物／名／id，餵 prompt + 守衛防撞。
  const existing = readExistingFoods();
  // 形態輪替：呢隻用邊個物種形態（防同質化，全部直立雙足 = Meshy rig 友善）
  const bodyPlan = chooseBodyPlan(draft, existing);
  // 最終形態原型輪替：stage 3 唔再隻隻翼＋光環天使
  const mythicArchetype = chooseMythicArchetype(draft, existing);
  const conceptPrompt = buildConceptPrompt({
    instructions: draft.instructions,
    existing,
    exclusive,
    hasRefImages,
    partnerLabel: draft.partnerLabel,
    bodyPlan,
    mythicArchetype,
  });
  draft.conceptPrompt = conceptPrompt;
  const guardOpts = { allowFoodDup: exclusive };

  // 過濾走會撞嘅 family（相似得、相同唔得）
  const available = FAMILIES.filter((f) => !collides(f, existing, guardOpts));
  const total = FAMILIES.length;
  const usable = available.length;

  // 食物池將盡偵測：可用少過總數 40% 或淨低 ≤1 條就警告
  const poolLow = usable <= Math.max(1, Math.floor(total * 0.4));
  const poolExhausted = usable === 0;

  // Step5：有 key 且 --live → 試真 Gemini；驗證通過又唔撞先用，否則 graceful 退 mock。
  let llmFam = null;
  if (flags.gemini && !dryRun && geminiConfigured) {
    try {
      // 有參考圖就一齊餵去 vision，令 LLM 睇餐廳品牌構思聯乘寵物
      const raw = await generateJson(conceptPrompt, hasRefImages ? { images: refImages } : {});
      const cand = validateLlmFamily(raw);
      if (cand && !collides(cand, existing, guardOpts)) llmFam = cand;
      else log(`concept: Gemini 回內容${cand ? "同現有撞" : "驗證唔過"}，退回 template`);
    } catch (e) {
      log(`concept: Gemini call 失敗（${e.message}），退回 template`);
    }
  }

  let fam;
  let poolNote;
  if (llmFam) {
    fam = llmFam;
    markStage(draft, "concept", { status: "done", mode: "gemini", detail: `LLM family=${llmFam.seriesId}` });
  } else if (poolExhausted) {
    // 池乾塘：仍出一條（hash 揀）等 pipeline 唔斷，但強烈標記要人手介入 + 附後備策略
    fam = FAMILIES[hashPick(draft.id, FAMILIES.length)];
    poolNote =
      "⚠️ 未撞菜式池已乾塘：所有 mock template 都同現有內容撞。強烈建議人手構思，或轉後備策略。";
  } else {
    fam = available[hashPick(draft.id, usable)];
    if (poolLow) poolNote = `⚠️ 未撞菜式池將盡：淨返 ${usable}/${total} 條可用，建議準備後備策略。`;
  }

  // 聯乘獨家但冇行到真 LLM：template 唔會反映品牌，強烈標記要人手介入
  if (exclusive && !llmFam) {
    poolNote =
      (poolNote ? poolNote + " " : "") +
      "⚠️ 聯乘獨家但未經真 LLM 生成（無 key／非 --live／或失敗），mock template 唔會反映餐廳品牌，需人手構思或真跑 --live。";
  }

  draft.family = buildFamily(draft, fam);
  // 記形態：art 生圖／rig 路由／finalize 旗標都會讀（三階共用同一形態）
  draft.family.bodyPlan = bodyPlan;
  // 記最終形態原型（下次輪替避開＋審批訊息可見）
  draft.family.mythicArchetype = mythicArchetype;
  for (const s of draft.family.stages) s.bodyPlan = bodyPlan;
  // 向下相容：draft.concept = stage1 摘要（pets-db / draft-store / 舊 code 讀得到）
  const s1 = draft.family.stages[0];
  draft.concept = {
    name: s1.name,
    seriesId: draft.family.seriesId,
    stage: 1,
    element: draft.family.element,
    flavor: draft.family.flavor,
    rarity: s1.rarity,
    foodOrigin: draft.family.foodOrigin,
    description: s1.description,
    theme: s1.theme,
    skillIdeas: s1.skillIdeas,
  };

  // 池狀態放入 draft 俾審批訊息 / dashboard 用
  draft.poolStatus = {
    total,
    usable,
    low: poolLow,
    exhausted: poolExhausted,
    note: poolNote ?? null,
    fallbackStrategies: poolLow || poolExhausted ? FALLBACK_STRATEGIES : undefined,
  };

  log(`concept: ${draft.family.foodOrigin.zh}系列（形態 ${bodyPlan}／終形 ${mythicArchetype}；3 階：${draft.family.stages.map((x) => x.name.zh).join(" → ")}）`);
  if (poolNote) log(`  ${poolNote}`);
  if (!llmFam) {
    markStage(draft, "concept", {
      status: "mock",
      mode: "mock",
      detail: `family=${draft.family.seriesId} 3階；池 ${usable}/${total}${poolLow ? " (將盡)" : ""}`,
    });
  }
  return draft;
}
