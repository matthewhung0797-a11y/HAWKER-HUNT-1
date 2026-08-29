// 系統二：統一畫風 prompt 來源（單一真相）。
// 目的：令 concept（諗菜式/三階）同 art（生立繪）用同一套畫風 DNA + rig-friendly 企姿
// + 去背背景要求 + 三階一致性 + 唯一性排除清單，確保新寵同現有 53 隻風格統一、
// 三階睇落係同一隻精靈成長、而且唔會同現有食物/名撞。
//
// 呢啲規則直接由 .cursor/skills/spirit-asset-pipeline/SKILL.md §2 沉澱落嚟。
// 真接 Gemini 時，image prompt 用英文（生圖模型英文效果較穩），concept 用中英雙語輸出。

import { readFileSync, existsSync } from "node:fs";

/**
 * 成套精靈嘅畫風 DNA（英文，餵生圖模型用）。
 * Nano Banana 2 對「painterly」呢類籠統形容詞冇反應（會滑去佢默認嘅清線 anime 風），
 * 要具體到 媒介＋技法＋質感 三件套，並用正面描述（官方指引：講你要乜，唔好講你唔要乜）。
 */
export const STYLE_DNA = [
  "Chibi anthropomorphic Singapore hawker-food creature mascot",
  "big expressive cartoon eyes, rounded soft chunky body",
  "MEDIUM: rich digital oil painting — every surface hand-painted with thick layered opaque brushstrokes, soft blended painted edges, like premium collectible-figurine box art",
  "TECHNIQUE: forms modelled purely with light and colour (painted edges, never inked contour lines; smooth colour gradations, never flat cel fills)",
  "TEXTURE: appetising food materials — crispy, juicy, glossy, caramelised surfaces with wet specular highlights and visible tactile depth",
  "high detail density and ornate finishing (armour trim, gems, sauce drips), scaling UP with evolution stage",
  "strong three-dimensional volume and form, dramatic warm studio lighting, soft rim light, subtle ambient occlusion on the character",
  "warm friendly collectible-monster design",
  "full body head-to-toe, standing, nearly front-facing camera on the face (tiny 3/4 tilt only)",
  "cohesive with a unified premium collectible set of food spirits",
].join(", ");

/**
 * 食物融合鐵律 —— 治「純粹攞碟嘢喺胸前／手上」嘅冇創意問題（同時救 rig：唔會有嘢橫喺身前）。
 * 菜式要「長」入角色本體同裝備：身體部位／盔甲／頭盔／披風／武器都由食材同煮食器具轉化而成，
 * 例如：盔甲＝米粿板塊、鑲邊＝菜脯、披風＝流動醬汁、頭盔＝蒸籠。
 * 嚴禁把整碟／整碗／一份完整菜式當道具攞喺手上或掛喺胸前。
 */
export const FOOD_EMBODIMENT = [
  "FOOD EMBODIMENT (CRITICAL for originality): the dish must be BUILT INTO the creature's own body and gear",
  "body parts, armour, helmet, cape, shield and attack organs are all TRANSFORMED from the dish's ingredients, sauces and cookware (e.g. armour plates = the cake/meat itself, trims = garnish, cape = dripping sauce, helmet = steamer/bowl, forearm blades = spatula-shaped plating)",
  "the food IS the character — do NOT just add a realistic plate / bowl / serving of the dish; NEVER show the creature simply holding or wearing a full plated dish as a chest-piece or accessory",
].join(". ");

/**
 * 一體化武裝（2026-08）：禁止獨立手持長武器——Meshy/Tripo auto-rig 會拉爛棍／鏟／串燒。
 * 攻擊力靠「長喺身上」嘅部位：大鉗、甲刃、角、掌刃、肩刺、尾刃。
 * 非海鮮一樣成立：器具→肢體、食材→甲（沙嗲串＝前臂刺、咖啡濾袋＝臂甲／披風）。
 */
export const INTEGRATED_ARMAMENT = [
  "INTEGRATED ARMAMENT (CRITICAL for 3D skinning): EMPTY HANDS / open claws — NO separate handheld weapons, staffs, spears, swords, spatulas, skewers, poles, whips, sceptres or tools gripped in the fingers",
  "any combat gear must be BODY-FUSED: oversized claws, blade-forearms, horn crests, shoulder spikes, shield-pauldrons grown into the arm, palm-blades, tail blades — cookware becomes LIMBS or ARMOUR, never a loose prop",
  "examples: satay → bamboo-spike forearms + ketupat pauldrons; kopi → sock-filter cape + cup-crown + steamer vents; kaya → toast-plate pauldrons + egg-orb shoulders; omelette → spatula-shaped palm-blades fused to the hands; rojak → cucumber-shield pauldrons + pineapple crest (no whip/staff)",
].join(". ");

/**
 * 面形鐵律（2026-08）：3D 轉向「半邊面先郁」主因係 2D 左右唔對稱／頭型碎。
 * 正面＋對稱＋整塊頭顱，先准落 Tripo。
 */
export const FACE_RULES = [
  "FACE (HIGHEST PRIORITY for 3D): camera nearly FRONT-FACING on the face (only a tiny 3/4 tilt allowed — never a strong side profile)",
  "perfect bilateral facial symmetry: both eyes the same size, fully visible, evenly spaced; centred nose and mouth; neither cheek hidden in shadow",
  "ONE solid head mass — helmet / crown / horns / crest fused into a single readable head silhouette (symmetrical left-right or a single centrepiece); no loose dangling head ornaments",
  "face never occluded by hands, weapons, sauce, hat brim, or props",
].join(". ");

/** Rig-friendly 企姿（唔跟會令之後 Meshy rig 422 拒） */
export const STANCE_RULES = [
  "Rig-friendly pose: both arms clearly separated from the torso (background visible under the armpits), near A-pose but keeping personality",
  "hands empty or ending in body-fused claws / blade-hands — never gripping a separate prop",
  "legs apart, standing straight, clean readable head-and-body silhouette",
].join(". ");

/**
 * 形態庫（body plan）：解決「全部人形 → 愈嚟愈似」嘅同質化問題。
 * 每個都係「直立雙足」底盤 —— 咁 Meshy pose-estimation 先認到，auto-rig 先出到有手有腳嘅
 * fullRig 動畫（實測人形以外嘅四足/蛇形/圓 blob Meshy rig 幾乎必敗）。物種外觀多元
 * （獸/龍/鳥/甲殼/水族/妖精/器物），但骨架一律企身，兼顧「多型態」＋「rig 得到」。
 * rig 欄：
 *   "meshy"  → 適合 Meshy auto-rig（會出全套 idle/attack/skill… clip，battle 手腳郁到）
 *   "static" → 圓身無四肢，唔好燒 rig credits，直接靜態網格＋程序化 idle/attack 托底
 */
export const BODY_PLANS = {
  "humanoid-chef": {
    label: "Humanoid hawker cook",
    identity:
      "an upright humanoid hawker-food spirit with clear human-like arms and legs (apron / utensil / chef vibe)",
    rig: "meshy",
  },
  "beast-kin": {
    label: "Upright beast-kin",
    identity:
      "an upright bipedal BEAST-person: an animal head (e.g. tiger / lion / bear / fox / cat) on a humanoid body, standing on two legs with human-like arms",
    rig: "meshy",
  },
  "dragon-kin": {
    label: "Upright dragon-kin",
    identity:
      "an upright bipedal DRAGON-person: horned reptilian head, scaled humanoid body, a tail held clear behind the legs, small folded wings tucked to the SIDES (not over the arms)",
    rig: "meshy",
  },
  "bird-kin": {
    label: "Upright bird-kin",
    identity:
      "an upright bipedal BIRD-person: a beaked bird head on a humanoid body, wings that read as ARMS spread out to the SIDES clear of the torso, standing on two bird legs",
    rig: "meshy",
  },
  "crustacean-kin": {
    label: "Upright crustacean warrior",
    identity:
      "an upright bipedal CRAB / PRAWN / LOBSTER warrior standing on two legs, big claws held OUT to the sides like fists, clear of the body",
    rig: "meshy",
  },
  "aquatic-kin": {
    label: "Upright aquatic-kin",
    identity:
      "an upright bipedal FISH / OCTOPUS / SQUID spirit standing on two stubby legs, arms/tentacles held OUT to the sides (not wrapping the body)",
    rig: "meshy",
  },
  "fae-spirit": {
    label: "Grounded food fae",
    identity:
      "a whimsical food FAE / sprite that STANDS firmly on two legs (grounded, NOT floating), with slender arms out to the sides",
    rig: "meshy",
  },
  "golem-utensil": {
    label: "Utensil golem",
    identity:
      "an upright bipedal KITCHEN-UTENSIL golem (wok / kettle / mortar / claypot body) with clearly separate blocky arms and legs",
    rig: "meshy",
  },
  "plant-kin": {
    label: "Upright plant / vine kin",
    identity:
      "an upright bipedal PLANT / fruit-vine person: a produce or leafy head (pineapple / gourd / radish / herb crown) on a humanoid body, vine or stem limbs held OUT to the sides, standing firmly on two root-like or stubby feet — NOT a human face in a fruit costume",
    rig: "meshy",
  },
  "fungus-spore": {
    label: "Soft dessert / fungus sprite",
    identity:
      "an upright bipedal SOFT DESSERT or fungus sprite: jelly / pudding / layered-cake / spore-cap head and soft squishy body, clear tiny arms and legs held OUT (grounded on two feet, NOT floating), cute and soft but still readable limbs for rigging",
    rig: "meshy",
  },
  // 例外：圓身無四肢（baby blob）—— 唔入常規輪替，rig 必敗，行靜態路
  blob: {
    label: "Round blob baby",
    identity: "a round, soft, limbless blob mascot (baby form)",
    rig: "static",
  },
};

/** 常規輪替名單（blob 唔入，因為 rig 唔到）；concept 逐隻換形態防同質化 */
export const BODY_PLAN_ROTATION = [
  "humanoid-chef",
  "beast-kin",
  "dragon-kin",
  "bird-kin",
  "crustacean-kin",
  "aquatic-kin",
  "fae-spirit",
  "golem-utensil",
  "plant-kin",
  "fungus-spore",
];

/** 攞形態定義（未知就退 humanoid-chef） */
export function bodyPlanOf(id) {
  return BODY_PLANS[id] ?? BODY_PLANS["humanoid-chef"];
}

/**
 * 最終形態（stage 3）神話原型庫：治「隻隻 final 都係翼＋光環天使」嘅同質化。
 * 舊 prompt 三處都硬列「wings / halo / floating aura / cape」，LLM 見到就默認畫天使——
 * 一整套收藏就冇新意。而家每個 family 由 concept 抽一個**唔同**嘅神話原型，
 * 「翼＋光環」只係其中一個選項（celestial），唔再係全體默認。
 * 每個都保持「直立雙足、四肢清晰」——所以照樣上到 Meshy fullRig。
 */
export const MYTHIC_ARCHETYPES = [
  { id: "war-general", desc: "a towering armoured WAR-GENERAL / shogun — heavy layered battle plate forged from the dish, blade-forearms or horned pauldrons as BODY-FUSED armament (EMPTY HANDS — no handheld weapon), broad imposing shoulders; grounded and monumental (NO wings, NO halo)" },
  { id: "emperor", desc: "a regal EMPEROR or EMPRESS on foot — flowing embroidered court robes, a tall ornate crown fused into one solid head mass, open hands or clawed hands (NO sceptre, NO handheld blade); stately and majestic (NO wings)" },
  { id: "celestial", desc: "a winged CELESTIAL / phoenix-being — great feathered or elemental wings and a radiant halo (this is the ONLY archetype that may use angelic wings + halo); empty talons, no handheld staff" },
  { id: "dragon-sovereign", desc: "a horned DRAGON-sovereign — draconic crest and horns as a single solid head mass, a scaled royal mantle, a long spined tail swept behind the legs, clawed empty hands; fierce and serpentine-royal" },
  { id: "many-armed-deity", desc: "a multi-armed guardian DEITY — TWO or THREE pairs of arms ending in BODY-FUSED blade-hands or claws (not gripping loose tools), a circular mandala aura behind the head (NO feathered wings)" },
  { id: "yokai-warlord", desc: "a fearsome ONI / YOKAI warlord — a fierce mask-like visage fused into one head mass, jagged lacquered armour, club-shaped forearm plating grown into the arms (no loose war-club), wild flaming hair; earthy and monstrous (NO halo)" },
  { id: "beast-king", desc: "a grand BEAST-KING — a huge ceremonial mane or ruff, royal guardian armour, oversized claw-blades grown from the paws (EMPTY of handheld glaives); noble and leonine (NO wings)" },
  { id: "elemental-titan", desc: "an ELEMENTAL TITAN / golem-lord — a massive craggy or molten body wreathed in its own element (steam / flame / broth), rugged plating fused from cookware, boulder fists; colossal and grounded (NO wings, NO halo, no handheld tools)" },
];

/** 輪替名單（concept 逐隻換一個 final 原型，防天使同質化） */
export const MYTHIC_ROTATION = MYTHIC_ARCHETYPES.map((a) => a.id);

/** 攞神話原型定義（未知就退第一個） */
export function mythicArchetypeOf(id) {
  return MYTHIC_ARCHETYPES.find((a) => a.id === id) ?? MYTHIC_ARCHETYPES[0];
}

/** 所有直立形態共用嘅 rig 通行證企姿（Meshy pose-estimation 認到人形先 rig 到手腳） */
export const RIG_STANCE = [
  "upright and BIPEDAL, standing firmly on two legs (weight on both feet, grounded — not floating, not flying)",
  "arms / forelimbs / claws / wings clearly SEPARATED from the torso — background must be visible under both armpits",
  "relaxed A-pose: elbows slightly out, hands OPEN and EMPTY at the sides (or ending in body-fused claws / palm-blades — never gripping a separate prop), legs apart",
  "any tail / wings / claws / shoulder spikes spread OUT to the sides beyond the body silhouette — never covering the torso or the arms",
  "NO handheld staff, spear, sword, spatula, skewer, whip, pole or sceptre anywhere in the image",
  "full body head-to-toe in one clean readable silhouette, front or slight 3/4 view facing camera",
].join(". ");

/**
 * 乾淨畫面（正面框架）：Nano Banana 2 對長負面清單反應差——你越講「唔好飄浮碎粒」，
 * 佢越會「見到」碎粒（實測 styletest-1 出咗成身飄浮食物碎）。官方指引係正面描述你要乜。
 */
export const CLEAN_CANVAS = [
  "Every single element in the image is physically fused to the character's body (armour, crest, claws, cape) — nothing loose in the hands or floating nearby",
  "the air around the character is completely clean and empty in all directions",
  "the character is the ONLY thing in the frame, crisp and in perfect focus",
].join("; ");

/** 精簡負面詞（只留 rig 致命項——呢啲冇正面寫法可以完全取代） */
export const NEGATIVE_STANCE =
  "AVOID (these break 3D auto-rigging / skinning): quadruped stance; legless / serpent body; floating with no visible legs; crossed arms; ANY separate handheld weapon or tool (staff, spear, sword, spatula, skewer, whip, pole, sceptre); a full plated dish held in front of the body; strong side-profile face; asymmetric eyes; sitting or crouching.";

/** 去背背景要求（cutout-art.mjs 係四角 flood-fill，色差容忍只有 13） */
export const BG_RULES = [
  "single flat solid background colour",
  "a LIGHT colour with clear contrast to the creature's main colour (never a near-white background for a light/white creature)",
  "creature fully centred with clear margin on all four sides, not touching the edges",
  "no shadow, no gradient, no texture, no ground plane, no props floating outside the character",
].join(", ");

/** 統一畫風參考圖 —— 按階配對（單一真相）。
 *  舊做法四張錨全部係一階幼體，令 stage 2/3 生圖見唔到「應有嘅細節密度」而愈生愈平。
 *  而家：stage 1 用可愛幼體錨、stage 2 用戰士級厚塗、stage 3 用 boss 級高細節厚塗，
 *  等生圖每一階都對齊到啱嘅立體感同質感。全部用 Glob 核實存在＋肉眼確認過質素。 */
export const STYLE_REF_BY_STAGE = {
  1: [
    "public/spirits/full/riceball-baby.webp",
    "public/spirits/full/chilli-baby.webp",
    "public/spirits/full/curry-puffling.webp",
  ],
  2: [
    "public/spirits/full/crab-claw-warrior.webp",
    "public/spirits/full/satay-warrior.webp",
    "public/spirits/full/bkt-warrior.webp",
  ],
  3: [
    "public/spirits/full/chilli-crab-king.webp",
    "public/spirits/full/satay-flame-emperor.webp",
    "public/spirits/full/laksa-dragon.webp",
  ],
};

/** 攞某階嘅畫風錨（未知階退 stage 1） */
export function styleRefsForStage(stage) {
  return STYLE_REF_BY_STAGE[stage] ?? STYLE_REF_BY_STAGE[1];
}

/** 向下相容：扁平化全部階錨（placeholder 記錄／其他 import 用） */
export const STYLE_REF_IMAGES = [...new Set(Object.values(STYLE_REF_BY_STAGE).flat())];

/**
 * 命名規則：名一律係單一稱號，唔准「稱號＋間隔號＋別名」（例如 叻沙龍·辛焱、咖啡烏皇·夜濃）。
 * 呢個格式以前係靠下面唯一性清單「教壞」LLM——清單會餵現有名入 prompt 叫佢唔好撞名，
 * 結果 AI 當咗係命名範本照抄，出咗一批帶別名嘅三階名，之後要人手剪。
 * 想寫詩意別名就擺去技能名（skillIdeas），唔好擺落寵物名。
 */
const NAME_RULES = [
  "NAMING RULES (strict):",
  "- Each name{zh} MUST be ONE single title only. Never append a second personal/epithet name after a separator.",
  "- FORBIDDEN in names: the interpunct 「·」, 「‧」, 「•」, 「・」, and any of : ： - — / ( ) 「」.",
  "  Write 叻沙龍, NOT 叻沙龍·辛焱. Write 咖啡烏皇, NOT 咖啡烏皇·夜濃.",
  "- name{zh} should be 2–5 Han characters; name{en} 1–4 words, no transliterated epithet tacked on the end",
  "  (write \"Laksa Dragon\", NOT \"Laksa Dragon Xinyan\").",
  "- Save any poetic epithet for the skill names in skillIdeas instead.",
].join("\n");

/** 三階演化描述（保持同一隻精靈成長感） */
const STAGE_BRIEF = {
  1: "STAGE 1 of 3: small, cute, baby form — the dish IS the body, plus ONE tiny signature seed motif that will grow later (a short spike, cup-ear, claw-bud, horn-bud, or single armour flake fused to the body). EMPTY tiny hands, NO handheld toy weapon",
  2: "STAGE 2 of 3: mid evolution warrior — bigger and more detailed; armour FORGED FROM the dish; combat power from BODY-FUSED organs (blade-forearms, claws, horn crest, shield-pauldrons) with EMPTY HANDS — NOT generic metal armour, NOT a plate of food, NOT any separate handheld weapon",
  3: "STAGE 3 of 3: final MYTHIC form — REBORN as a legendary being (not a bigger warrior with a bigger stick). Silhouette jumps to the family's mythic archetype (war-general / emperor / celestial / dragon-sovereign / many-armed deity / yokai / beast-king / titan — do NOT default to winged-halo angel unless chosen). Dish motifs fuse into the mythic body; EMPTY HANDS / claws only; upright BIPEDAL with clear limbs for 3D rigging",
};

/**
 * 砌一個 stage 嘅立繪生圖 prompt。
 * @param concept 概念 spec（name/foodOrigin/theme/element…）
 * @param stage   1|2|3
 * @param opts    { priorStageRef?: string, hasPartnerRef?: boolean, bodyPlan?: string, mythicArchetype?: string }
 *                bodyPlan 決定物種形態（獸/龍/鳥…），姿勢一律 rig-friendly 直立雙足。
 *                mythicArchetype 只對 stage 3 注入轉生剪影（唔再默認人形武士）。
 */
export function buildArtPrompt(concept, stage = 1, opts = {}) {
  const food = concept?.foodOrigin?.en ?? concept?.foodOrigin ?? "hawker food";
  const theme = concept?.theme ?? "";
  const bp = bodyPlanOf(opts.bodyPlan);
  const ma = opts.mythicArchetype ? mythicArchetypeOf(opts.mythicArchetype) : null;
  const isBlob = bp.rig === "static";
  const mythicLine =
    stage === 3 && ma
      ? `MYTHIC ARCHETYPE (MUST commit — NOT a bigger humanoid warrior): ${ma.desc}.`
      : "";
  const evo =
    stage === 3
      ? "This is the FINAL stage of a 3-stage evolution family based on the SAME dish. " +
        "Keep the same signature palette, food motifs and facial identity — but this stage MUST read as a DRAMATIC mythical transformation / rebirth: " +
        "a NEW silhouette class that COMMITS to the family's chosen mythic archetype, NOT the same character with fancier armour, and NOT defaulting to generic angel wings + halo unless that archetype is celestial. " +
        (opts.priorStageRef
          ? "The last reference image is the PREVIOUS stage: evolve FAR beyond it — do NOT copy its outfit or pose; amplify BODY-FUSED armament into mythic claws/horns/blade-limbs (still NO handheld weapons). "
          : "")
      : "This is one of a 3-stage evolution family based on the SAME dish; " +
        "keep the SAME signature colours, food motifs and facial identity across all stages, while each stage has a distinctly different silhouette and gear level. " +
        (opts.priorStageRef ? "Match the previous stage's character identity (see reference) and grow its seed motif into stronger body-fused armour/claws. " : "");
  const partner = opts.hasPartnerRef
    ? "IMPORTANT: one of the reference images is the PARTNER BRAND (a restaurant's logo / mascot / signature dish). " +
      "Incorporate its identity — colours, motif, signature ingredient — into this spirit, while still matching the collectible set's art DNA. "
    : "";
  const pose = isBlob
    ? `Pose: ${STANCE_RULES}. ${CLEAN_CANVAS}.`
    : `Pose (MUST follow exactly — the art is auto-rigged into 3D, wrong pose = no skeleton): ${RIG_STANCE}.\n${CLEAN_CANVAS}.\n${NEGATIVE_STANCE}`;
  return [
    `ART STYLE — HIGHEST PRIORITY. The attached reference images are the official STYLE GUIDE of this collectible set. Reproduce their exact RENDERING TECHNIQUE: the same thick painted brushwork, the same soft painted (never inked) edges, the same colour depth and glossy material highlights, the same detail density. The new character must look like it was painted by the same artist, in the same session. Full style DNA: ${STYLE_DNA}.`,
    `${FACE_RULES}.`,
    `${FOOD_EMBODIMENT}.`,
    `${INTEGRATED_ARMAMENT}.`,
    `Character concept: a ${food}-themed food spirit. ${theme}`,
    `Body plan / species form: ${bp.identity}${stage === 3 ? " — now ASCENDED into its mythic final form (species DNA still recognisable, but silhouette transcended)" : ""}.`,
    mythicLine,
    STAGE_BRIEF[stage] ?? STAGE_BRIEF[1],
    evo,
    partner,
    pose,
    `Background: ${BG_RULES}.`,
    "SCOPE NOTE: the 'no shadow / no gradient / no texture' rules above apply to the BACKGROUND ONLY. The CHARACTER itself MUST keep its full rich painterly shading, glossy highlights, internal shadows and 3D volume — do NOT flatten the creature.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 砌 concept（諗一條全新三階食物精靈系列）嘅 LLM prompt。
 * @param opts { instructions?: string, existing?: {names:string[], foods:string[]},
 *              exclusive?: boolean, hasRefImages?: boolean, partnerLabel?: string }
 */
export function buildConceptPrompt(opts = {}) {
  const { instructions, existing, exclusive, hasRefImages, partnerLabel, bodyPlan, mythicArchetype } = opts;
  const bp = bodyPlan ? bodyPlanOf(bodyPlan) : null;
  const ma = mythicArchetype ? mythicArchetypeOf(mythicArchetype) : null;
  // 形態指引：bodyPlan 只鎖一、二階；三階必須 archetype 跳變，而且**指定一個唔同嘅神話原型**
  //（唔再隻隻翼＋光環天使——舊配方剪影要大變先有「轉生」感，但形態要多元先唔會通用）
  const bodyPlanLine = bp
    ? `SPECIES FORM for stages 1–2 (baby and warrior forms share it): ${bp.identity}. ` +
      "Stage 1 may be a rounder baby version. " +
      `STAGE 3 MUST be an ARCHETYPE JUMP — a DRAMATIC rebirth whose SILHOUETTE CLASS is clearly different from stage 2. For THIS family, shape the final form as: ${ma ? ma.desc : "a distinct legendary being (emperor / dragon-sovereign / celestial / war-general / many-armed deity / beast-king / titan…)"}. Commit fully to that ONE archetype; do NOT fall back on a generic winged-angel-with-halo look unless that is the chosen archetype. Keep the species' face and palette recognisable, but stage 3 is a transformation, NOT a bigger warrior. ` +
      "ARMAMENT RULE: NO separate handheld weapons at ANY stage. Stage 1 = one tiny body-fused seed motif; stage 2 = body-fused claws/blade-forearms/horn crest/shield-pauldrons; stage 3 = mythic amplification of those fused organs. Each stage's fused armament should READ differently (grow/transform), but never as a loose tool in the hands. " +
      "ALL stages (including stage 3's mythic form) MUST be describable as an upright bipedal figure with arms/legs/claws clearly separate from the body (this is required so the 2D art can be auto-rigged into an animated 3D model). " +
      "Write each stage's theme so an artist would naturally draw that upright, limbs-apart pose with EMPTY HANDS and a front-facing symmetric face."
    : "";
  const exclusion =
    existing && (existing.foods?.length || existing.names?.length)
      ? `\n\nDO NOT duplicate any of these already-used dishes or names (you MAY be stylistically similar, but the dish, the name and the id MUST be distinct and unique).\nThis list is ONLY for collision avoidance — do NOT copy its naming FORMAT; follow the NAMING RULES above.\nDishes: ${(existing.foods ?? []).join(", ")}\nNames: ${(existing.names ?? []).join(", ")}`
      : "";
  // 聯乘獨家：叫 LLM 睇參考圖（品牌）+ 容許以佢哋招牌菜做原型；但個 seriesId/名/id 仍要獨一無二
  const partner = exclusive
    ? [
        hasRefImages
          ? `A reference image of the PARTNER BRAND${partnerLabel ? ` (${partnerLabel})` : ""} is attached — read its logo / mascot / signature dish, and design a pet that clearly evokes that brand.`
          : `This is an EXCLUSIVE partner commission${partnerLabel ? ` for ${partnerLabel}` : ""}.`,
        "You MAY base the family on the partner's signature dish even if that dish already exists in the game (this is intentional and exclusive), but the seriesId, all stage ids and all names MUST still be brand-new and unique.",
      ].join(" ")
    : "";
  return [
    "Invent ONE brand-new Singapore/Malaysian hawker-food spirit FAMILY for the game Hawker Hunt.",
    "It must be a real or highly plausible hawker dish, turned into a cute collectible monster family of 3 evolution stages.",
    exclusive
      ? "Design goals: the seriesId, ids and names must be UNIQUE; the dish may match the partner brand."
      : "Design goals: every dish must be UNIQUE (no collision with existing pets); may resemble the style but never be identical.",
    partner || undefined,
    bodyPlanLine || undefined,
    instructions ? `Creator direction for this one: ${instructions}` : "No specific direction — free creative choice.",
    "",
    "Return JSON with: seriesId (ascii kebab-case, unique), foodOrigin {en,zh}, element (one of metal/wood/water/fire/earth), flavor (one of bitter/sour/salty/sweet/spicy per 五行五味), and stages: an array of EXACTLY 3 objects each { id (ascii kebab-case, unique per stage), stage (1|2|3), name{en,zh}, description{en,zh}, theme, skillIdeas (string array, EXACTLY 1–2 ideas; temporary hard cap of 2 special skills per stage including any heal/guard — do NOT list 3+) }.",
    NAME_RULES,
    `Keep every stage consistent with this art DNA: ${STYLE_DNA}.`,
    exclusion,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/**
 * 由 species.ts 抓現有食物/名做唯一性排除清單（best-effort text parse，node 用）。
 * node 唔 import TS，所以直接 regex 掃 text；抓唔到就回空陣列（graceful）。
 */
export function readExistingFoods(speciesFile = "src/content/species.ts") {
  const out = { ids: [], names: [], foods: [] };
  if (!existsSync(speciesFile)) return out;
  let src = "";
  try {
    src = readFileSync(speciesFile, "utf8");
  } catch {
    return out;
  }
  for (const m of src.matchAll(/\bid:\s*"([a-z0-9-]+)"/g)) out.ids.push(m[1]);
  for (const m of src.matchAll(/foodOrigin:\s*\{\s*en:\s*"([^"]+)",\s*zh:\s*"([^"]+)"/g)) {
    out.foods.push(m[1], m[2]);
  }
  for (const m of src.matchAll(/name:\s*\{\s*en:\s*"([^"]+)",\s*zh:\s*"([^"]+)"/g)) {
    out.names.push(m[1], m[2]);
  }
  // 去重
  out.ids = [...new Set(out.ids)];
  out.names = [...new Set(out.names)];
  out.foods = [...new Set(out.foods)];
  return out;
}
