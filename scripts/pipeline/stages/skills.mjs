// Stage: skills —— 由每階 concept.skillIdeas formalize 成 species.ts 嘅 Skill[] schema。
// 平衡（power/cooldown/heal）永遠由 deterministic 範本決定（避免 LLM 亂開數值失衡）；
// 有 GEMINI key 且非 dry-run → 只叫 LLM 補雙語名/描述（graceful：失敗／未設就 mock 文案）。
// 三階數值遞增：stage 越高普攻/次攻越強。
// 鐵律（暫時）：每階最多 MAX_SKILLS_PER_STAGE 招（普攻另計）；治療佔其中一格，禁止兩攻再 append。

import { flags } from "../lib/env.mjs";
import { markStage } from "../lib/draft.mjs";
import { generateJson, geminiConfigured } from "../lib/gemini.mjs";
import { MAX_SKILLS_PER_STAGE } from "../lib/skill-limits.mjs";

export { MAX_SKILLS_PER_STAGE };

// 攻擊技數值範本 by stage（跟 species.ts：階越高 power 越大）
const ATTACK_BY_STAGE = {
  1: [{ power: 1.0, cooldown: 0 }, { power: 1.4, cooldown: 2 }],
  2: [{ power: 1.1, cooldown: 0 }, { power: 1.7, cooldown: 2 }],
  3: [{ power: 1.2, cooldown: 0 }, { power: 2.0, cooldown: 3 }],
};

// 同 skill-fx.ts 對齊；管線輸出要係可直接序列化嘅 plain object。
const ELEMENT_FX_COLORS = {
  fire: ["#ff6a2a", "#ffd94d", "#ff3a1a"],
  water: ["#4fc3f7", "#a8e6ff", "#2196d8"],
  metal: ["#ffd700", "#fff2b0", "#d8a12f"],
  earth: ["#e8c860", "#c89a5a", "#ffedb0"],
  wood: ["#66d97a", "#b8f0a0", "#2e9a51"],
};

const FOOD_KEYWORDS = [
  ["chilli", /chilli|chili|辣椒|辣|叁巴|sambal/i],
  ["noodle", /noodle|mee|麵|粉|粿條|vermicelli/i],
  ["grain", /rice|grain|飯|米|糯/i],
  ["garlic", /garlic|蒜/i],
  ["bone", /bone|rib|骨|排骨/i],
  ["youtiao", /youtiao|油條/i],
  ["leaf", /leaf|pandan|蕉葉|斑蘭|葉/i],
  ["kueh", /kueh|糕|粿/i],
  ["egg", /egg|蛋|卵/i],
  ["toast", /toast|bread|吐司|麵包/i],
  ["claypot", /claypot|砂鍋|煲/i],
  ["coconut", /coconut|椰/i],
  ["pepper", /pepper|胡椒/i],
  ["mantou", /mantou|饅頭/i],
  ["skewer", /skewer|satay|沙嗲|竹籤/i],
  ["bean", /coffee|kopi|bean|咖啡|豆/i],
  ["radish", /radish|菜頭|蘿蔔/i],
  ["fruit", /fruit|pineapple|水果|菠蘿/i],
  ["peanut", /peanut|花生/i],
  ["oyster", /oyster|蠔/i],
  ["puff", /puff|酥皮|咖喱卜/i],
  ["prata", /prata|煎餅/i],
  ["jelly", /jelly|煎蕊|綠蕊/i],
  ["ice", /ice|冰|雪/i],
  ["redbean", /red bean|redbean|紅豆/i],
];

function fxArchetype(skill, idea) {
  const text = `${skill.id} ${idea ?? ""} ${skill.name?.en ?? ""} ${skill.name?.zh ?? ""}`;
  if (skill.healPercent != null || /heal|restore|治癒|治療|回復|回春/i.test(text)) return "heal";
  if (/shield|guard|護盾|守護|護體|防護/i.test(text)) return "shield";
  if (/splash|sauce|湯|醬/i.test(text)) return "splash";
  if (/slash|刀|斬|鞭/i.test(text)) return "slash";
  if (/barrage|storm|雨|風暴|暴/i.test(text)) return "barrage";
  if (/breath|噴|焰/i.test(text)) return "breath";
  if (/smash|slam|砸|錘|震|重擊/i.test(text)) return "smash";
  return "projectile";
}

function foodFor(text, element, archetype) {
  if (archetype === "heal" || archetype === "shield") {
    const found = FOOD_KEYWORDS.find(([, re]) => re.test(text));
    return found?.[0] ?? "glow";
  }
  if (archetype === "splash") return "droplet";
  const found = FOOD_KEYWORDS.find(([, re]) => re.test(text));
  if (found) return found[0];
  return { fire: "chilli", water: "droplet", metal: "pepper", earth: "grain", wood: "leaf" }[element] ?? "glow";
}

function buildFx(draft, skeletonByStage, stages) {
  const element = draft.family?.element ?? draft.concept?.element ?? "earth";
  const colors = ELEMENT_FX_COLORS[element] ?? ELEMENT_FX_COLORS.earth;
  const fxBySkill = {};
  for (const st of stages) {
    for (const sk of skeletonByStage[st.id] ?? []) {
      const text = `${sk.idea ?? ""} ${sk.name?.en ?? ""} ${sk.name?.zh ?? ""}`;
      const archetype = fxArchetype(sk, sk.idea);
      fxBySkill[sk.id] = {
        archetype,
        ...(st.stage === 3 && sk.power >= 2 ? { scale: 1.5, secondary: true } : {}),
        colors: [...colors],
        food: foodFor(text, element, archetype),
      };
    }
  }

  const first = skeletonByStage[stages[0]?.id]?.[0];
  const firstArchetype = first ? fxArchetype(first, first.idea) : "projectile";
  const motion = firstArchetype === "slash" ? "slash"
    : firstArchetype === "smash" ? "smash"
      : ["projectile", "barrage", "breath", "splash"].includes(firstArchetype) ? "shoot"
        : "stab";
  const basicText = `${draft.family?.foodOrigin?.en ?? ""} ${draft.family?.foodOrigin?.zh ?? ""} ${first?.idea ?? ""}`;
  return {
    fxBySkill,
    basicFx: { motion, colors: [...colors], food: foodFor(basicText, element, "projectile") },
  };
}

const HEAL_IDEA_RE = /回復|回春|治癒|治療|守護|護體|護盾|heal|restore|guard|shield/i;

/** 砌某階嘅技能骨架（id / power / cooldown / heal 由範本鎖死；文案暫用 mock，之後 LLM 覆蓋） */
function skeletonFor(stageId, stage, ideas) {
  const tpls = ATTACK_BY_STAGE[stage] ?? ATTACK_BY_STAGE[1];
  const skills = [];
  // 最多兩格：治療類 idea 佔一格（唔好再 append 變第三招）
  const picked = (ideas ?? []).slice(0, MAX_SKILLS_PER_STAGE);
  let attackIdx = 0;
  for (const idea of picked) {
    if (HEAL_IDEA_RE.test(idea)) {
      skills.push({
        id: `${stageId}-heal`,
        idea,
        name: { en: "Restore", zh: idea },
        description: { en: "Restores 30% HP to the team.", zh: `為全隊回復 30% HP：${idea}` },
        power: 0,
        cooldown: 3,
        healPercent: 0.3,
      });
    } else {
      const tpl = tpls[attackIdx] ?? tpls[0];
      attackIdx++;
      skills.push({
        id: `${stageId}-skill-${attackIdx}`,
        idea,
        name: { en: `Skill ${attackIdx}`, zh: idea },
        description: {
          en: `Mock skill from concept idea ${attackIdx}.`,
          zh: `由概念點子生成：${idea}`,
        },
        power: tpl.power,
        cooldown: tpl.cooldown,
      });
    }
  }
  if (skills.length === 0) {
    skills.push({
      id: `${stageId}-basic`,
      idea: "basic strike",
      name: { en: "Basic Strike", zh: "基本攻擊" },
      description: { en: "A simple attack.", zh: "簡單一擊。" },
      power: 1.0,
      cooldown: 0,
    });
  }
  return skills.slice(0, MAX_SKILLS_PER_STAGE);
}

/** 砌 LLM prompt：只求雙語名/描述（每個技能 by id），唔准改數值。 */
function buildSkillsPrompt(draft, skeletonByStage) {
  const fam = draft.family ?? draft.concept ?? {};
  const food = fam.foodOrigin?.en ?? "hawker dish";
  const entries = [];
  for (const [stageId, sks] of Object.entries(skeletonByStage)) {
    const st = (draft.family?.stages ?? []).find((s) => s.id === stageId);
    for (const sk of sks) {
      entries.push({
        id: sk.id,
        stage: st?.stage ?? 1,
        petName: st?.name?.en ?? draft.concept?.name?.en ?? "spirit",
        idea: sk.idea,
        kind: sk.healPercent ? "heal/support" : "attack",
      });
    }
  }
  return [
    `You are naming battle skills for a Singapore/Malaysian hawker-food spirit family based on "${food}" (element: ${fam.element}, flavour: ${fam.flavor}).`,
    "For EACH skill below, write a punchy bilingual (English + Traditional Chinese) skill NAME and a one-sentence bilingual DESCRIPTION.",
    "Rules: names must be evocative and food-themed (reference the dish's ingredients/aroma/heat); descriptions describe the in-battle effect in one short sentence; do NOT invent numbers or percentages; keep Chinese natural (Cantonese-friendly, Traditional characters).",
    "Return STRICT JSON only: { \"skills\": { \"<id>\": { \"nameEn\": string, \"nameZh\": string, \"descEn\": string, \"descZh\": string } } }.",
    "",
    "Skills:",
    JSON.stringify(entries, null, 2),
  ].join("\n");
}

/** 用 LLM 回傳嘅文案覆蓋骨架（缺／爛就保留 mock）。回傳實際覆蓋咗幾多個。 */
function applyText(skeletonByStage, llm) {
  const map = llm?.skills;
  if (!map || typeof map !== "object") return 0;
  let n = 0;
  for (const sks of Object.values(skeletonByStage)) {
    for (const sk of sks) {
      const t = map[sk.id];
      if (!t) continue;
      const nameEn = typeof t.nameEn === "string" ? t.nameEn.trim() : "";
      const nameZh = typeof t.nameZh === "string" ? t.nameZh.trim() : "";
      const descEn = typeof t.descEn === "string" ? t.descEn.trim() : "";
      const descZh = typeof t.descZh === "string" ? t.descZh.trim() : "";
      if (nameEn && nameZh) {
        sk.name = { en: nameEn, zh: nameZh };
        if (descEn && descZh) sk.description = { en: descEn, zh: descZh };
        n++;
      }
    }
  }
  return n;
}

/** 去走骨架入面淨係內部用嘅 idea 欄位（species.ts 唔要） */
function strip(skeletonByStage) {
  const out = {};
  for (const [k, sks] of Object.entries(skeletonByStage)) {
    out[k] = sks.map(({ idea, ...rest }) => rest);
  }
  return out;
}

export async function run(ctx) {
  const { draft, dryRun, log } = ctx;

  const stages = draft.family?.stages ?? (draft.concept ? [{ id: draft.id, stage: 1, skillIdeas: draft.concept.skillIdeas }] : []);
  const skeletonByStage = {};
  let count = 0;
  for (const st of stages) {
    const sk = skeletonFor(st.id, st.stage, st.skillIdeas ?? []);
    skeletonByStage[st.id] = sk;
    count += sk.length;
  }

  let mode = "mock";
  if (flags.gemini && !dryRun && geminiConfigured) {
    try {
      const prompt = buildSkillsPrompt(draft, skeletonByStage);
      const raw = await generateJson(prompt);
      const applied = applyText(skeletonByStage, raw);
      if (applied > 0) {
        mode = "gemini";
        log(`skills: Gemini 補咗 ${applied}/${count} 個技能雙語名/描述`);
      } else {
        log("skills: Gemini 回內容驗唔到，全部退回 mock 文案");
      }
    } catch (e) {
      log(`skills: Gemini call 失敗（${e.message}），退回 mock 文案`);
    }
  } else if (flags.gemini && !dryRun) {
    log("skills: GEMINI 未設，暫用 mock 範本");
  }

  const finalByStage = strip(skeletonByStage);
  draft.skillsByStage = finalByStage;
  const fx = buildFx(draft, skeletonByStage, stages);
  draft.fxBySkill = fx.fxBySkill;
  draft.basicFx = fx.basicFx;
  // 向下相容：skills = stage1
  draft.skills = finalByStage[stages[0]?.id] ?? [];
  log(`skills: 生成 ${count} 個技能（${stages.length} 階，${mode}）`);
  markStage(draft, "skills", { status: mode === "gemini" ? "done" : "mock", mode, detail: `${count} skills / ${stages.length} 階` });
  return draft;
}
