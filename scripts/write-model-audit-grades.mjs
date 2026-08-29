// 寫入全圖鑑目視分級（配合 audit-model-quality 截圖）。可手改 grades 再重跑。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "test-shots/model-audit";
mkdirSync(OUT, { recursive: true });

const src = readFileSync("src/content/species.ts", "utf8").replace(/\r\n/g, "\n");
const start = src.indexOf("export const SPECIES:");
const end = src.indexOf("export const SPECIES_MAP");
const body = src.slice(start, end > 0 ? end : undefined);
const chunks = body.split(/\n  \{\n    id: "/).slice(1);

const meta = [];
for (const chunk of chunks) {
  const id = chunk.match(/^([^"]+)"/)?.[1];
  if (!id) continue;
  meta.push({
    id,
    zh: chunk.match(/name: \{ en: "[^"]*", zh: "([^"]+)" \}/)?.[1] ?? id,
    seriesId: chunk.match(/seriesId: "([^"]+)"/)?.[1] ?? "",
    stage: Number(chunk.match(/stage: (\d+)/)?.[1] ?? 0),
    rigMode: !/modelUrl:/.test(chunk)
      ? "none"
      : !/animated:\s*true/.test(chunk)
        ? "static"
        : /rigLite:\s*true/.test(chunk)
          ? "rigLite"
          : "fullRig",
    facingLock: /\/\/ facing-lock:/.test(chunk),
  });
}

/** @type {Record<string, { grade: "P0"|"P1"|"P2"; reasons: string[]; action: string }>} */
const grades = {
  // ── HQ remake 2026-08 完成（待 facing-lock）──
  "carrot-cake-warrior": {
    grade: "P2",
    reasons: ["HQ remake：Meshy fullRig；attack 浮塊已消"],
    action: "待 facing-lock 校準",
  },
  "chilli-crablet": {
    grade: "P2",
    reasons: ["HQ remake：Tripo rigLite；idle 已企正"],
    action: "待 facing-lock 校準",
  },
  "kaya-warrior": {
    grade: "P2",
    reasons: ["HQ remake：Meshy fullRig"],
    action: "待 facing-lock 校準",
  },
  "kopi-sock-warrior": {
    grade: "P2",
    reasons: ["HQ remake：Meshy fullRig；袋離身"],
    action: "待 facing-lock 校準",
  },
  "rojak-tot": {
    grade: "P2",
    reasons: ["HQ remake：Tripo rigLite"],
    action: "待 facing-lock 校準",
  },
  "rojak-warrior": {
    grade: "P2",
    reasons: ["HQ remake：Meshy fullRig"],
    action: "待 facing-lock 校準",
  },
  "rojak-king": {
    grade: "P2",
    reasons: ["HQ remake：Meshy fullRig"],
    action: "待 facing-lock 校準",
  },

  // ── 用戶標箭但屬「難 rig／醜但可辨」→ P1 ──
  "kopi-o-emperor": {
    grade: "P1",
    reasons: ["泥濘網格／地台感", "用戶標箭但可辨識"],
    action: "排期重製或 strip-junk；暫可留",
  },
  "satay-warrior": {
    grade: "P1",
    reasons: ["披風／腳底凌亂", "用戶標箭"],
    action: "排期 polish；非阻塞",
  },
  "lapis-queen": {
    grade: "P1",
    reasons: ["長裙難 Meshy（skill 已知）", "用戶標頸後", "應保持 rigLite"],
    action: "接受 Tripo/rigLite；必要時重畫臉／裙分離",
  },
  "tutu-sprite": {
    grade: "P1",
    reasons: ["blob＋底座", "用戶標箭", "先天難 fullRig"],
    action: "可改 static／程序化；唔好硬 Meshy",
  },
  "hainan-chicken-god": {
    grade: "P1",
    reasons: ["披風雞難 Meshy（skill 已知）", "用戶標披風／腳"],
    action: "維持 rigLite；可 polish 立繪再 Tripo",
  },

  // oily-rice-chick：用戶確認剔出 P0（縮放／idle 展示，唔入首輪重製）
  "oily-rice-chick": {
    grade: "P1",
    reasons: ["idle 視角細／定位；用戶剔出首輪重製"],
    action: "另查 modelHeight／idle root；唔燒 3D credits 先",
  },

  // ── 攻擊姿明顯垮 ──
  "omelette-warrior": {
    grade: "P1",
    reasons: ["attack 側影糊、武器貼身"],
    action: "排期；未到浮塊級",
  },
  "oyster-immortal": {
    grade: "P1",
    reasons: ["attack 過曝／溶成光團"],
    action: "驗 clip／材質；可能要重 bake",
  },
  "prata-sky-elephant": {
    grade: "P1",
    reasons: ["多浮空件（設計 or junk）"],
    action: "strip-junk 分析；保留設計碎屑",
  },
  "wanton-mee-shogun": {
    grade: "P1",
    reasons: ["旗／甲過密泥濘"],
    action: "新批樣；可 polish",
  },
  "satay-flame-emperor": {
    grade: "P1",
    reasons: ["火焰尾難判面向"],
    action: "facing-lock 必做；mesh 暫可",
  },
  "kaya-dragon": {
    grade: "P1",
    reasons: ["複雜多肢／能量感噪音"],
    action: "排期",
  },
  "black-white-cake-king": {
    grade: "P1",
    reasons: ["浮空粿粒＋軟邊"],
    action: "同 carrot-cake 系列：mid P0 先、王階跟住",
  },
  "chwee-shogun": {
    grade: "P1",
    reasons: ["翼／披風貼背"],
    action: "新批可留；facing-lock",
  },
  "kachang-deity-sovereign": {
    grade: "P1",
    reasons: ["多臂神像超複雜"],
    action: "目視暫可辨；風險高排期",
  },
};

// 預設：stage1 blob-ish → P1（預期託底）；其餘未列 → P2
const blobIds = new Set([
  "kaya-blob",
  "radish-cubie",
  "kopi-bean",
  "chendol-jelly",
  "coconut-jelly",
  "chilli-baby",
  "riceball-baby",
  "curry-puffling",
  "prata-pup",
  "satay-skewerling",
  "little-laksa",
  "bkt-cub",
  "little-orh-luak",
  "garlic-guard",
  "lemongrass-swordsman",
  "vermicelli-sprite",
  "egg-guard",
  "shrimp-hopper",
  "nasi-lemak-tot",
  "otah-tot",
  "chwee-hamlet",
  "kachang-snowling",
  "wanton-pup",
  "kway-teow-kid",
]);

const rows = meta.map((m) => {
  const g = grades[m.id];
  if (g) {
    return { ...m, ...g, source: "manual" };
  }
  if (blobIds.has(m.id) || (m.stage === 1 && m.rigMode === "rigLite")) {
    return {
      ...m,
      grade: "P1",
      reasons: ["圓身／baby／ingredient：skill 預期難 fullRig"],
      action: "維持 static 或 rigLite＋程序化；唔列入重製首輪",
      source: "rule-blob",
    };
  }
  if (!m.facingLock) {
    return {
      ...m,
      grade: "P2",
      reasons: ["目視可玩；缺 facing-lock（技術債，非 mesh 壞）"],
      action: "另開 facing 校準批次；唔當 3D 重製",
      source: "default-ok",
    };
  }
  return {
    ...m,
    grade: "P2",
    reasons: ["有 facing-lock；剪影可讀"],
    action: "維持；回歸時抽樣",
    source: "default-ok",
  };
});

// 已知較靚參考（仍可 P2，reasons 註明）
for (const id of [
  "laksa-warrior",
  "bkt-warrior",
  "nasi-lemak-scout",
  "nasi-lemak-general",
  "otah-swashbuckler",
  "otah-pyrolord-chong",
  "charsiu-blade",
  "chwee-sentry",
]) {
  const r = rows.find((x) => x.id === id);
  if (r && r.grade === "P2") {
    r.reasons = ["新批／目視參考水準（可讀、武器在手）", ...(r.reasons ?? [])];
    r.action = "當品質錨；舊批對齊呢啲";
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  criteria: {
    P0: "浮塊／斷肢穿模／側倒唔企／idle 不可見／用戶確認壞且阻遊戲",
    P1: "醜但可辨、先天難 rig（blob／長裙／披風雞）、缺 polish、缺 facing-lock 以外嘅美學債",
    P2: "而家可留；最多欠 facing-lock 校準",
  },
  counts: {
    P0: rows.filter((r) => r.grade === "P0").length,
    P1: rows.filter((r) => r.grade === "P1").length,
    P2: rows.filter((r) => r.grade === "P2").length,
    facingLock: rows.filter((r) => r.facingLock).length,
  },
  rows,
};

writeFileSync(join(OUT, "grades.json"), JSON.stringify(summary, null, 2));

const byGrade = (g) => rows.filter((r) => r.grade === g);
const line = (r) =>
  `| \`${r.id}\` | ${r.zh} | ${r.seriesId} | s${r.stage} | ${r.rigMode} | ${r.facingLock ? "Y" : "—"} | ${r.reasons.join("；")} | ${r.action} |`;

const md = `# 全圖鑑 3D 品質審計（草稿）

生成：${summary.generatedAt}

截圖：\`test-shots/model-audit/shots/\`、\`montage-idle-*.png\`、\`montage-attack-*.png\`  
重跑：\`node scripts/audit-model-quality.mjs\` → \`node scripts/write-model-audit-grades.mjs\`

## 準則

| 級 | 定義 |
|---|---|
| **P0** | ${summary.criteria.P0} |
| **P1** | ${summary.criteria.P1} |
| **P2** | ${summary.criteria.P2} |

## 統計

| 級 | 隻數 |
|---|---|
| P0 | **${summary.counts.P0}** |
| P1 | **${summary.counts.P1}** |
| P2 | **${summary.counts.P2}** |
| 有 facing-lock | ${summary.counts.facingLock} / ${rows.length} |

## 建議下一步（唔燒 credits 前你先確認）

1. **先確認 P0 清單**（下面）——有誤殺／漏網就改 \`scripts/write-model-audit-grades.mjs\` 再跑
2. **首輪重製建議整系列做**：\`rojak\`（tot/warrior/king）＋ \`carrot-cake-warrior\`（跟住 black-white）＋ \`kaya-warrior\`＋ \`kopi-sock-warrior\`＋ \`chilli-crablet\`＋ \`oily-rice-chick\` 縮放
3. **唔好全圖鑑一次重製**；P1 blob／長裙多數係決策託底，唔係「失敗＝下架」
4. **唔建議集體下架**——用重製或 static 託底；下架只留真係短期修唔到嘅極少數

## P0（${summary.counts.P0}）

| id | 名 | 系列 | 階 | rig | lock | 理由 | 建議動作 |
|---|---|---|---|---|---|---|---|
${byGrade("P0").map(line).join("\n")}

## P1（${summary.counts.P1}）

| id | 名 | 系列 | 階 | rig | lock | 理由 | 建議動作 |
|---|---|---|---|---|---|---|---|
${byGrade("P1").map(line).join("\n")}

## P2（${summary.counts.P2}）

| id | 名 | 系列 | 階 | rig | lock | 理由 | 建議動作 |
|---|---|---|---|---|---|---|---|
${byGrade("P2").map(line).join("\n")}
`;

writeFileSync(join(OUT, "AUDIT.md"), md);
console.log("wrote", join(OUT, "grades.json"), "and AUDIT.md");
console.log("counts", summary.counts);
