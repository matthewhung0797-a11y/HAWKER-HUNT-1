// 系統二 orchestrator —— 順序行 stage，逐個更新 pending pet draft（JSON）。
//
// 用法：
//   node scripts/pipeline/run.mjs [--id=<id>] [--job=<uuid>] [--kind=catalogue|commission] [--live] [--no-approve]
//   node scripts/pipeline/run.mjs --phase=concept-art --job=<uuid>       # 只出 concept+art，唔燒 3D
//   node scripts/pipeline/run.mjs --phase=from-3d --id=<已有draft>       # 由 3D 續跑
//   node scripts/pipeline/run.mjs --phase=full                           # 一條龍（預設）
//   node scripts/pipeline/run.mjs --body-plan=dragon-kin ...             # 指定物種形態
//   node scripts/pipeline/run.mjs --id=... --only=art / --from=skills    # 人手覆寫 stage 範圍
//
// 預設 DRY-RUN。加 --live 先會喺有 key 時真生成；缺 key／出錯 graceful。

import { execSync } from "node:child_process";
import { flags } from "./lib/env.mjs";
import { createDraft, readDraft, writeDraft, readInbox, clearInbox, STAGE_ORDER, markStage } from "./lib/draft.mjs";
import { upsertPetDraft, petsDbConfigured } from "./lib/pets-db.mjs";
import {
  claimOrGetJob,
  downloadJobRefs,
  jobsDbConfigured,
  markConsumed,
  markFailed,
  requeueStale,
  uploadApprovalPreview,
} from "./lib/jobs-db.mjs";
import { geminiConfigured } from "./lib/gemini.mjs";
import { run as concept } from "./stages/concept.mjs";
import { run as art } from "./stages/art.mjs";
import { run as model3d } from "./stages/model3d.mjs";
import { run as rig } from "./stages/rig.mjs";
import { run as finalize } from "./stages/finalize.mjs";
import { run as skills } from "./stages/skills.mjs";

const STAGES = { concept, art, model3d, rig, finalize, skills };

const argv = process.argv.slice(2);
const getArg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const dryRun = !argv.includes("--live");
const noApprove = argv.includes("--no-approve");
const only = getArg("only");
const from = getArg("from");
const phaseArg = getArg("phase") || "full";
const instructionsArg = getArg("instructions");
const bodyPlanArg = getArg("body-plan");
const jobIdArg = getArg("job");
const kindArg = getArg("kind");
if (kindArg && !["catalogue", "commission"].includes(kindArg)) {
  console.error(`--kind 只接受 catalogue|commission（收到 ${kindArg}）`);
  process.exit(1);
}
if (!["concept-art", "from-3d", "full"].includes(phaseArg)) {
  console.error(`--phase 只接受 concept-art|from-3d|full（收到 ${phaseArg}）`);
  process.exit(1);
}
if (phaseArg === "concept-art" && !jobIdArg) {
  console.error("concept-art 需要 --job=<uuid>（由後台工單開跑）。");
  process.exit(1);
}

function genId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `auto-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

const id = getArg("id") || argv.find((a) => !a.startsWith("--")) || genId();
const log = (msg) => console.log(`  ${msg}`);

console.log(`\n=== 出寵物管線 [${id}] phase=${phaseArg} ${dryRun ? "DRY-RUN (mock)" : "LIVE"} ===`);
console.log(`   keys: gemini=${flags.gemini} meshy=${flags.meshy} tripo=${flags.tripo} telegram=${flags.telegram}`);

if (phaseArg !== "from-3d") {
  const staleCount = await requeueStale();
  if (staleCount) console.log(`   已重新排隊 ${staleCount} 張逾時工單`);
}

// from-3d 只續已有 draft，唔 claim／改工單。
let activeJob = null;
if (phaseArg !== "from-3d") {
  if (jobIdArg) {
    activeJob = await claimOrGetJob({ jobId: jobIdArg, kind: kindArg });
    if (!activeJob) {
      console.error(`搵唔到可開始嘅 job：${jobIdArg}`);
      process.exit(1);
    }
  } else if (phaseArg === "full" && kindArg === "commission") {
    activeJob = await claimOrGetJob({ kind: "commission" });
    if (!activeJob) {
      console.error("冇 queued commission job，停止（commission 唔會自由發揮）。");
      process.exit(1);
    }
  } else if (phaseArg === "full" && jobsDbConfigured) {
    // cron／一條龍冇指定工單時，只會自動 claim catalogue。
    activeJob = await claimOrGetJob({ kind: "catalogue" });
  }
}

const selectedKind = activeJob?.kind ?? kindArg ?? "catalogue";
if (selectedKind === "commission" && !dryRun && !geminiConfigured && phaseArg !== "from-3d") {
  const message = "commission live 需要 GEMINI_API_KEY，唔可以用 mock concept 交單";
  if (activeJob) await markFailed(activeJob.id, message);
  console.error(message);
  process.exit(1);
}

let jobRefImages = [];
if (activeJob) {
  jobRefImages = await downloadJobRefs(activeJob, `content/pending-pets/_job-assets/${id}`);
  console.log(`   工單：${activeJob.id}（${activeJob.kind}；參考圖 ${jobRefImages.length} 張）`);
}

// 讀 / 建 draft。job 欄位覆蓋 CLI/inbox，避免 runner 攞到舊方向。
let draft = readDraft(id);
if (phaseArg === "from-3d" && !draft) {
  console.error(`from-3d 需要已有 draft：content/pending-pets/${id}.json`);
  process.exit(1);
}
const inbox = activeJob ? null : readInbox();
const jobOpts = activeJob ? {
  kind: activeJob.kind,
  allowTextOnly: activeJob.allow_text_only,
  instructions: activeJob.instructions,
  refImages: jobRefImages,
  exclusive: activeJob.exclusive,
  partnerLabel: activeJob.partner_label,
} : null;
if (!draft) {
  const opts = {
    kind: jobOpts?.kind ?? selectedKind,
    allowTextOnly: jobOpts?.allowTextOnly,
    instructions: jobOpts?.instructions ?? instructionsArg ?? inbox?.instructions,
    refImages: jobOpts?.refImages ?? inbox?.refImages,
    exclusive: jobOpts?.exclusive ?? inbox?.exclusive,
    partnerLabel: jobOpts?.partnerLabel ?? inbox?.partnerLabel,
  };
  draft = createDraft(id, opts);
  writeDraft(draft);
  if (opts.instructions) console.log(`   指示：${opts.instructions}`);
  if (opts.refImages?.length) console.log(`   參考圖：${opts.refImages.length} 張${opts.exclusive ? "（聯乘獨家）" : ""}`);
  // 用完即清：inbox 方向／參考圖唔應該殘留落之後每一隻寵物
  if (inbox) clearInbox();
} else if (jobOpts) {
  Object.assign(draft, {
    kind: jobOpts.kind,
    allowTextOnly: jobOpts.allowTextOnly,
    instructions: jobOpts.instructions || undefined,
    refImages: jobOpts.refImages.length ? jobOpts.refImages : undefined,
    exclusive: Boolean(jobOpts.exclusive),
    partnerLabel: jobOpts.partnerLabel || undefined,
  });
  writeDraft(draft);
}

// 形態指定（--body-plan）：畀 concept 用（否則自動輪替）
if (bodyPlanArg) {
  draft.bodyPlanOverride = bodyPlanArg;
  console.log(`   指定形態：${bodyPlanArg}`);
}

// phase 先定預設範圍；--only／--from 仍可人手覆寫。
let toRun = STAGE_ORDER.filter((s) => s !== "draft"); // draft(assemble) 最後 inline 做
if (only) toRun = toRun.filter((s) => s === only);
else if (from) toRun = toRun.slice(toRun.indexOf(from));
else if (phaseArg === "concept-art") toRun = ["concept", "art"];
else if (phaseArg === "from-3d") toRun = ["model3d", "rig", "finalize", "skills"];
// full 跑晒所有 stage。

console.log(`   stages：${toRun.join(" → ")}`);

for (const stage of toRun) {
  const fn = STAGES[stage];
  if (!fn) continue;
  console.log(`\n▶ ${stage}`);
  try {
    draft = await fn({ draft, dryRun, log });
  } catch (e) {
    // 理論上 stage 內部已 catch，呢度係最後防線
    log(`${stage} 意外錯誤：${e.message}`);
    markStage(draft, stage, { status: "error", detail: e.message });
    writeDraft(draft);
    if (activeJob) await markFailed(activeJob.id, `${stage}: ${e.message}`);
    process.exit(1);
  }
  writeDraft(draft);
}

// ── draft(assemble)：由 family + skills + finalize 砌出成條三階 Species 線 ──
if (!only || only === "draft") {
  console.log(`\n▶ draft (assemble)`);
  const fam = draft.family;
  const fin = draft.finalize ?? {};
  // baseStats 按 stage 大約遞增（同 species.ts 對齊）
  const statsByStage = {
    1: { hp: 45, attack: 13, defense: 10, speed: 14 },
    2: { hp: 72, attack: 22, defense: 18, speed: 20 },
    3: { hp: 102, attack: 34, defense: 28, speed: 26 },
  };
  // 進化條件：stage1→2 5 份材料 + 打卡 2；stage2→3 10 份 + 打卡 5
  const evoReqByStage = {
    1: (item) => ({ items: { [item]: 5 }, checkinCentres: 2 }),
    2: (item) => ({ items: { [item]: 10 }, checkinCentres: 5 }),
  };

  if (fam?.stages?.length) {
    const list = fam.stages.map((st, i) => {
      const next = fam.stages[i + 1];
      const stageModel = draft.finalizeByStage?.[st.id] ?? null;
      return {
        id: st.id,
        seriesId: fam.seriesId,
        stage: st.stage,
        name: st.name,
        element: fam.element,
        flavor: fam.flavor,
        rarity: st.rarity,
        foodOrigin: fam.foodOrigin,
        description: st.description,
        baseStats: statsByStage[st.stage] ?? statsByStage[1],
        skills: draft.skillsByStage?.[st.id] ?? [],
        evolvesTo: next ? next.id : null,
        evolutionRequirement: next ? evoReqByStage[st.stage]?.(fam.evolutionItemId) ?? null : null,
        // 有真模型（modelUrl）先帶動畫 / rig 旗標——mock 條目一律 null
        modelUrl: stageModel?.modelUrl ?? null,
        modelHeightM: stageModel?.modelHeightM ?? fin.modelHeightM ?? 0.3,
        ...(stageModel?.modelUrl && stageModel.animated ? { animated: true } : {}),
        ...(stageModel?.modelUrl && stageModel.rigLite ? { rigLite: true } : {}),
        ...(stageModel?.modelUrl && stageModel.modelYaw != null ? { modelYaw: stageModel.modelYaw } : {}),
      };
    });
    draft.speciesList = list;
    draft.species = list[0]; // 向下相容 alias
    draft.evolutionItemId = fam.evolutionItemId;
    draft.evolutionItem = fam.evolutionItem ?? null;
    draft.pipelinePhase = phaseArg;
    // concept-art 停喺睇圖閘；from-3d／full 要有真 GLB 先入最終待審（唔接受 mock 3D）。
    const liveOk = !dryRun;
    if (!liveOk) {
      draft.status = "generating";
      draft.manifest.mock = true;
    } else if (phaseArg === "concept-art") {
      draft.status = "awaiting-art-review";
    } else {
      const { checkReal3dReady } = await import("./lib/playability.mjs");
      const r3 = checkReal3dReady(draft);
      if (r3.ok) {
        draft.status = "awaiting-approval";
      } else {
        draft.status = "needs-3d-retry";
        draft.playabilityErrors = r3.errors;
        log(`draft: 真 3D 未齊，唔入待審批——${r3.errors.join("; ")}`);
      }
    }
    markStage(draft, "draft", {
      status: draft.status === "needs-3d-retry" ? "error" : "done",
      detail: `三階 species 已組裝（${list.map((s) => s.id).join(" → ")}）；phase=${phaseArg}；status=${draft.status}`,
    });
    log(`draft: 組裝完成 ${list.length} 階，status=${draft.status}`);
  } else {
    log("draft: 冇 family，跳過組裝");
    if (activeJob) await markFailed(activeJob.id, "draft assemble: missing family");
    process.exit(1);
  }
  writeDraft(draft);
}

// 睇立繪同最終待審都要縮圖，後台唔使等 merge。
if (draft.status === "awaiting-art-review" || draft.status === "awaiting-approval") {
  const stage1Id = draft.speciesList?.[0]?.id ?? draft.species?.id;
  const artPath =
    (stage1Id && draft.artifacts?.artByStage?.[stage1Id]) ||
    draft.artifacts?.art ||
    (stage1Id ? `public/spirits/full/${stage1Id}.webp` : null);
  if (artPath && String(artPath).endsWith(".webp")) {
    const previewUrl = await uploadApprovalPreview(id, artPath);
    if (previewUrl) {
      draft.artifacts = { ...draft.artifacts, previewUrl };
      writeDraft(draft);
      console.log(`\n▶ 預覽已上傳 Storage`);
    }
  }
}

// ── 鏡射落 Supabase pets 表（serverless 可靠真相來源）；未配置就 skip ──
if (petsDbConfigured) {
  const res = await upsertPetDraft(draft);
  console.log(`\n▶ pets DB：${res.ok ? "已寫入 ✅" : res.skipped ? "skip（未配置）" : "失敗"}`);
}

// 真生成去到人工閘先 consume；3D 失敗／mock 唔食單（可重試）。
if (activeJob) {
  if (draft.status === "awaiting-art-review" || draft.status === "awaiting-approval") {
    const consumed = await markConsumed(activeJob.id, id);
    console.log(`\n▶ job：${consumed ? "已標記 consumed ✅" : "標記 consumed 失敗"}`);
  } else if (draft.status === "needs-3d-retry") {
    const msg = (draft.playabilityErrors ?? []).join("; ") || "3D finalize 未齊";
    await markFailed(activeJob.id, msg);
    console.log(`\n▶ job：3D 未齊，已標 failed（可後台重試）：${msg}`);
  } else {
    await markFailed(activeJob.id, "dry-run/mock：未產生待審草稿，工單未消耗");
    console.log(`\n▶ job：mock 未消耗（已標 failed，可後台重試）`);
  }
}

// ── manifest 總結 ──
console.log(`\n=== manifest [${id}] ===`);
for (const s of STAGE_ORDER) {
  const r = draft.manifest[s];
  console.log(`  ${s.padEnd(9)} ${r ? `${r.status}${r.mode ? ` (${r.mode})` : ""}` : "—"}`);
}
console.log(`  draft: content/pending-pets/${id}.json`);

// ── 送睇圖／審批提醒（人在環）——除非 --no-approve ──
if (!noApprove && (draft.status === "awaiting-art-review" || draft.status === "awaiting-approval")) {
  console.log(`\n▶ 發送後台提醒（${draft.status}）`);
  try {
    execSync(`node scripts/pipeline/request-approval.mjs ${id}`, { stdio: "inherit" });
  } catch (e) {
    console.log(`  提醒失敗：${e.message}`);
  }
}

console.log(`\n完成。status=${draft.status}`);
if (draft.status === "awaiting-art-review") {
  console.log(`  後台睇立繪後撳「繼續 3D」：--phase=from-3d --id=${id}`);
} else if (draft.status === "needs-3d-retry") {
  console.log(`  真 3D 未齊，修好 key／重跑：--phase=from-3d --id=${id} --live`);
  process.exitCode = 1;
} else if (draft.status === "awaiting-approval") {
  console.log(`  CI／本機跑 facing-cal-shots 後，後台揀 yaw＋checklist 先批准`);
  console.log(`  本機：DIAG_BASE=http://localhost:3000 node scripts/pipeline/facing-cal-shots.mjs ${id}`);
  console.log(`  批准後出街：node scripts/pipeline/publish.mjs ${id} --commit`);
} else {
  console.log(`  狀態 ${draft.status}——未到人工閘`);
}
