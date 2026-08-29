// 既有精靈 HQ 重畫立繪（Gemini）→ 去背 → full + icon。⚠️ 燒 Gemini credits。
// 用法：node scripts/remake-hq-art.mjs <id...>
// 2026-08：一體化武裝＋正面對稱臉＋按系列 bodyPlan／mythic（禁一律 humanoid-chef）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildArtPrompt,
  bodyPlanOf,
  styleRefsForStage,
} from "./pipeline/lib/style-prompt.mjs";
import { generateImage, geminiConfigured } from "./pipeline/lib/gemini.mjs";
import { cutoutToWebp, iconFromFullWebp } from "./pipeline/lib/cutout.mjs";

const ASSETS = "C:/Users/user/.cursor/projects/c-Users-user-hawker-hunt/assets";
const ARTIFACT = "content/pending-pets/artifacts/hq-remake";

/**
 * 系列鎖定：一～二階 bodyPlan + 三階 mythic。
 * 辣蟹已對／沙嗲炎帝保留舊模 → 唔強逼重畫。
 */
const SERIES_PROFILE = {
  kaya: { bodyPlan: "dragon-kin", mythic: "dragon-sovereign" },
  satay: { bodyPlan: "bird-kin", mythic: "celestial" },
  kopi: { bodyPlan: "golem-utensil", mythic: "emperor" },
  rojak: { bodyPlan: "fae-spirit", mythic: "yokai-warlord" },
  "chai-tow-kway": { bodyPlan: "golem-utensil", mythic: "war-general" },
  "oyster-omelette": { bodyPlan: "aquatic-kin", mythic: "elemental-titan" },
  "chilli-crab": { bodyPlan: "crustacean-kin", mythic: "beast-king" },
  // 新 plan 預留：蔬果／甜品系
  chendol: { bodyPlan: "fungus-spore", mythic: "celestial" },
  tutu: { bodyPlan: "fungus-spore", mythic: "emperor" },
  lapis: { bodyPlan: "fungus-spore", mythic: "emperor" },
  // 嘟嘟糕／九層糕系實際 seriesId
  kueh: { bodyPlan: "fungus-spore", mythic: "emperor" },
};

/** 人手 theme：強調物種頭／剪影，唔好畫成普通人臉武士 */
const THEMES = {
  "rojak-warrior":
    "Stage-2 upright FOOD FAE warrior (NOT a human face): whimsical fruit-sprite head with pineapple-leaf crest fused into ONE solid head mass, cucumber SHIELD-PAULDRONS grown into shoulders, doughy cream body, EMPTY HANDS. Open A-pose, perfect bilateral fae face, no floating crumbs.",
  "rojak-king":
    "Stage-3 MYTHIC yokai-warlord rebirth (NOT a human emperor): fierce ONI / fruit-demon visage fused into one solid head with towering pineapple-youtiao crest, haeko-sauce cape fused into jagged lacquered fruit armour, cucumber blade-pauldrons, EMPTY HANDS. Symmetric front face, open stance.",
  "carrot-cake-warrior":
    "Stage-2 upright RADISH-CAKE GOLEM (NOT human): blocky chai tow kway cube head and body plates with spring-onion flecks, spatula-shaped FOREARM BLADES fused into arms, EMPTY blade-hands. Golem face carved into cake, open A-pose, solid symmetric front face.",
  "black-white-cake-king":
    "Stage-3 MYTHIC war-general rebirth as dual-tone cake GOLEM: left white / right dark-soy cake armour fused into monumental blocky body, spatula-motif crown fused into one solid golem head (not a human king), blade-forearm plating, EMPTY HANDS. Symmetric front face, open stance.",
  "kaya-warrior":
    "Stage-2 upright DRAGON-KIN kaya toast warrior: emerald reptilian dragon head (NOT human) with toast-plate horn crest as ONE solid head mass, kaya-jam scales, soft-egg orb pauldrons fused in, EMPTY clawed hands. Open armpits, perfect bilateral dragon face, planted feet.",
  "kaya-dragon":
    "Stage-3 MYTHIC dragon-sovereign rebirth: upright bipedal emerald DRAGON with kaya-jam scales, toast-horn crest + soft-egg pauldrons fused, long tail clear behind legs, small side-tucked wings optional, EMPTY clawed hands. Perfect bilateral dragon face facing camera — NOT a human in a dragon costume.",
  "kopi-sock-warrior":
    "Stage-2 upright KOPI-POT / utensil GOLEM (NOT human): coffee-pot or sock-filter vessel body with blocky arms/legs, cup-rim forearm plating, steam-vent shoulder buds, sock-filter cape fused to back, EMPTY HANDS. Golem face on the vessel, open stance, symmetric front face.",
  "kopi-o-emperor":
    "Stage-3 MYTHIC emperor rebirth as regal KOPI-VESSEL GOLEM: towering coffee-urn / cup-crown body fused into one solid head mass, porcelain-green floral plating, black-gold sock-filter cape fused, EMPTY clawed golem hands (no staff). Symmetric front face on the vessel — NOT a human face.",
  "satay-warrior":
    "Stage-2 upright BIRD-KIN satay warrior: beaked bird head with ketupat leaf crest fused into ONE solid head, wings-as-arms spread OUT to sides, grilled-meat body plates, peanut-sauce cape fused, bamboo spike FOREARMS grown from wing-arms, EMPTY open talons. Symmetric bird face, planted bird legs.",
  "omelette-warrior":
    "Stage-2 upright AQUATIC-KIN oyster omelette warrior: fish / marine head (NOT human) with herb-omelette crest fused into one solid head, egg-batter armour, spatula-shaped PALM-BLADES fused to hands, tentacle or fin accents held OUT. Symmetric aquatic face, open A-pose.",
  "oyster-immortal":
    "Stage-3 MYTHIC elemental-titan rebirth: upright oyster-pearl ELEMENTAL titan — shell-and-steam body, scallop-crown fused into one solid head, pearl-claw / blade-forearms BODY-FUSED, EMPTY of staff. Symmetric front face, readable limbs, no overexposed white blob.",
  "tutu-sprite":
    "Stage-1 kueh-tutu SOFT DESSERT sprite (same family as oily-rice-chick cute food pets — NOT snowman, NOT two stacked balls, NOT human). ONE plump pear-shaped WHITE steamed kueh body with light coconut-flour dust, clear stubby arms and legs held OUT (visible armpits, open A-pose). Heart-shaped gula-melaka syrup FILLING window LOW on belly only (glossy amber candy glass — never a hole, never on the face). Cute non-human dessert face: big symmetric glossy eyes, tiny smile, soft blush. Small centered coconut/sugar tuft on head. Banana-leaf pad fused under feet. EMPTY HANDS. Flat LIGHT SKY-BLUE BG. No particles.",
  "lapis-queen":
    "Stage-2 evolution of the SAME kueh-tutu dessert sprite (keep soft white dessert face DNA + coconut motif). Body GROWS rainbow kueh-lapis cake LAYERS (pink/green/cream stripes) as soft squishy armour-gown fused into one being — still a food spirit, NOT a human girl, NOT a dragon, NOT a block golem. Readable stubby arms/legs OUT in open A-pose, EMPTY HANDS. Crystal-sugar crown fused into soft dessert head. Perfect bilateral front face. Flat LIGHT MINT BG. No particles, no handheld fan.",
  "pastry-queen":
    "Stage-3 MYTHIC rebirth of the SAME kueh dessert line (same soft dessert face DNA — NOT human queen, NOT dragon). Towering multi-layer kueh / pastry sovereign: rainbow cake-layer body, ondeh-ondeh + gula-melaka crown fused into one solid soft head, golden cake-plate pauldrons fused, EMPTY HANDS (no staff). Open A-pose, readable bipedal limbs, symmetric front dessert face. Flat LIGHT GOLD BG. No particles.",
};

function parseSpecies(id) {
  const src = readFileSync("src/content/species.ts", "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf("export const SPECIES:");
  const end = src.indexOf("export const SPECIES_MAP");
  const body = src.slice(start, end);
  const chunks = body.split(/\n  \{\n    id: "/).slice(1);
  for (const chunk of chunks) {
    const cid = chunk.match(/^([^"]+)"/)?.[1];
    if (cid !== id) continue;
    return {
      id,
      seriesId: chunk.match(/seriesId: "([^"]+)"/)?.[1] ?? "",
      stage: Number(chunk.match(/stage: (\d+)/)?.[1] ?? 1),
      name: {
        en: chunk.match(/name: \{ en: "([^"]+)"/)?.[1] ?? id,
        zh: chunk.match(/name: \{ en: "[^"]*", zh: "([^"]+)" \}/)?.[1] ?? id,
      },
      foodOrigin: {
        en: chunk.match(/foodOrigin: \{ en: "([^"]+)"/)?.[1] ?? "hawker food",
        zh: chunk.match(/foodOrigin: \{ en: "[^"]*", zh: "([^"]+)" \}/)?.[1] ?? "",
      },
      description: {
        en: chunk.match(/description: \{\s*en: "([^"]+)"/)?.[1] ?? "",
      },
    };
  }
  return null;
}

function loadRef(path) {
  if (!existsSync(path)) return null;
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp";
  return { mimeType, data: readFileSync(path).toString("base64") };
}

function profileFor(sp) {
  const p = SERIES_PROFILE[sp.seriesId];
  if (p) return p;
  // 無表：一階偏 fae，其餘唔再默認 humanoid-chef——用 beast-kin 做中性底
  return {
    bodyPlan: sp.stage === 1 ? "fae-spirit" : "beast-kin",
    mythic: "beast-king",
  };
}

const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) {
  console.error("usage: node scripts/remake-hq-art.mjs <id...>");
  process.exit(1);
}
if (!geminiConfigured) {
  console.error("GEMINI_API_KEY 未設");
  process.exit(1);
}

mkdirSync(ARTIFACT, { recursive: true });
mkdirSync(ASSETS, { recursive: true });

let priorRefPath = null;
for (const id of ids) {
  const sp = parseSpecies(id);
  if (!sp) {
    console.error(`skip ${id}: 唔喺 species.ts`);
    continue;
  }
  const profile = profileFor(sp);
  const bp = bodyPlanOf(profile.bodyPlan);
  const theme =
    THEMES[id] ??
    `${sp.description.en}. Species form: ${bp.identity}. EMPTY HANDS, body-fused armour only, perfect front-facing symmetric non-human face, open A-pose.`;

  const prompt = buildArtPrompt(
    { ...sp, theme, foodOrigin: sp.foodOrigin },
    sp.stage,
    {
      ...(priorRefPath ? { priorStageRef: priorRefPath } : {}),
      bodyPlan: profile.bodyPlan,
      ...(sp.stage === 3 ? { mythicArchetype: profile.mythic } : {}),
    },
  );

  const styleRefs = styleRefsForStage(sp.stage).map(loadRef).filter(Boolean);
  const refs = [...styleRefs];
  // 嘟嘟糕系：錨住遊戲內成功嘅 Q 版食物精靈，唔好飄去公主／雪人
  if (sp.seriesId === "kueh") {
    for (const p of [
      "public/spirits/full/oily-rice-chick.webp",
      "public/spirits/full/little-laksa.webp",
      "public/spirits/full/curry-puffling.webp",
    ]) {
      const r = loadRef(p);
      if (r) refs.push(r);
    }
  }
  if (priorRefPath) {
    const p = loadRef(priorRefPath);
    if (p) refs.push(p);
  }

  console.log(
    `\n=== art ${id} (stage ${sp.stage}, series ${sp.seriesId}, plan ${profile.bodyPlan}${sp.stage === 3 ? ` / ${profile.mythic}` : ""}) ===`,
  );
  const { buffer } = await generateImage(prompt, { refImages: refs, aspectRatio: "3:4" });
  const rawPng = join(ASSETS, `${id}.png`);
  const rawArt = join(ARTIFACT, `${id}.raw.png`);
  writeFileSync(rawPng, buffer);
  writeFileSync(rawArt, buffer);
  const full = `public/spirits/full/${id}.webp`;
  await cutoutToWebp(buffer, full);
  await iconFromFullWebp(full, `public/spirits/${id}.webp`);
  priorRefPath = full;
  console.log(`ok → ${full} + icon + assets/${id}.png`);
}
console.log("\nDONE art remake");
