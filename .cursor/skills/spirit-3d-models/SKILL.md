---
name: spirit-3d-models
description: >-
  Rules for the battle 3D spirit models (public/models/*.glb, SpiritModel.tsx,
  species.ts modelYaw/animated/rigLite). Use when a pet is not animating,
  faces the wrong way in battle, when swapping/adding a GLB, or when editing
  modelYaw / animated / rigLite / model-pipeline assets.
---

# Spirit 3D models (battle rigs & facing)

53 spirits render via `SpiritModel.tsx` -> `GlbSpirit` from `public/models/<id>.glb`,
configured per-entry in `src/content/species.ts` (`modelUrl`, `modelHeightM`,
`animated`, `rigLite`, `modelYaw`). Source/backup assets live in `model-pipeline/`.

## Golden rules (these caused real bugs)

1. **Every combat spirit should be RIGGED (7 clips).** A GLB that reports 0 clips /
   no skin is a static mesh that was wrongly swapped in. The correct rigged version
   usually already exists in the pipeline — do NOT tell the user "it's a static-asset
   limitation" before checking `model-pipeline/`.
2. **`animated: true` is required** for clips to play. A rigged GLB with no `animated`
   flag renders frozen.
3. **Judge facing by the TORSO/body, never the head.** The idle clip rotates
   heads/necks/trunks, so a dragon/elephant/monkey can look like it faces the wrong
   way for one frame. Correct = the body's **back is symmetric toward the camera**
   (spine/shoulders/wings/rear), because the battle camera sits behind the player and
   the enemy is on the right. This mistake produced several false positives.
4. **`facing-lock` 鐵律（2026-07-29）**：`species.ts` 每隻有 GLB 嘅 entry 都有
   `// facing-lock: YYYY-MM-DD player-back enemy-face`。有呢行＝已校準鎖定。
   **禁止**為咗「修一隻敵位」而改 `modelYaw`、加 `enemyYawFlip`、或者改 battle
   `lookAt`。要改＝先重跑校準流程（下面），再改日期註解。換 GLB／重 finalize／重 rig
   會令 lock 失效——必須當未校準處理。

## Auditing which models are static vs rigged

```bash
node scripts/audit-models.mjs
```
Prints `RIGGED`/`STATIC` per species with clip names, skin, joints, and the
`animated`/`rigLite`/`modelYaw` flags. Any `STATIC` line for a combat spirit is a bug.

## Finding the correct source GLB

Pipeline layout (rigged sources, biggest = rawest):
- `model-pipeline/gen/anim/<id>/merged.glb` — raw merged animation (multiple skins, messy).
- `model-pipeline/backup-models/pre-linebfix/<id>.glb` — **processed, single-skin, 7 clips.
  This is the one to restore** (matches the structure of working `public/models/*.glb`).
- `model-pipeline/gen/meshy/<id>.glb` / `gen/tripo/<id>.glb` — raw Meshy / Tripo bases.

Inspect a GLB's clips/skins/root bone without a decoder (parses the JSON chunk):
```bash
node -e "const{readFileSync}=require('fs');const b=readFileSync(process.argv[1]);const l=b.readUInt32LE(12);const d=JSON.parse(b.slice(20,20+l));const idle=(d.animations||[]).find(a=>a.name==='idle')||d.animations?.[0];console.log('clips',(d.animations||[]).map(a=>a.name),'skins',(d.skins||[]).length,'root',idle&&d.nodes[idle.channels[0].target.node].name)" public/models/<id>.glb
```

## rigLite decision (from the root bone name)

- Root bone `Hips` (~24-joint Meshy humanoid, e.g. `bkt-warrior`) -> **full rig, no `rigLite`.**
- Root bone `tripo::Root` (Tripo rig) -> **`rigLite: true`（強制）.** This enables runtime
  `stripRoot` (`SpiritModel.tsx` filters `/Root\.(quaternion|position)$/`) so baked root
  motion doesn't fight the battle `lookAt` and drift／側身. **漏 `rigLite`＝切磋長期側身**
  （2026-07：`kaya-warrior`／`satay-warrior`／`curry-puff-warrior` 實例）——調 `modelYaw` 救唔到.
- Note: `stripRoot` only matches nodes ending in `Root.*`, so it does NOT strip Meshy
  `Hips` motion — that's fine, Meshy in-place clips (like `bkt-warrior`) work as full rigs.
- **lookAt 已對稱**：同一 `modelYaw` 下玩家見背、敵位見面。唔好加敵位 +π。
  `kaya-dragon`／`laksa-dragon` 都係 `modelYaw: 0`。咖央大尾易誤判背／面——以胸口綠寶石同眼睛為準。

## Three animation tiers (how `SpiritModel` decides motion)

`fullRig = animated && !rigLite`. The tier drives how much life the model has in battle:

| tier | flags | source | battle motion |
|---|---|---|---|
| **fullRig** | `animated: true` (no `rigLite`) | Meshy auto-rig (~24-joint `Hips`) | plays real skeletal clips — arms/legs swing, attacks NOT stiff |
| **rigLite** | `animated: true` + `rigLite: true` | Tripo rig (`tripo::Root`) | plays small Tripo clips + `stripRoot` + **procedural attack/idle overlay** |
| **static** | `animated: false` (no `rigLite`) | Tripo mesh, no rig | **procedural only**: idle bob, hit shake, **windup→lunge attack** |

The **procedural attack** (added 2026-07 in `SpiritModel.tsx`) fires on entering `attack`/`skill`
for any `!fullRig` model: a "wind-up lean-back → forward thrust → recoil" over ~0.42 s
(`atkT` ref, `rotation.x` pitch + hop + scale pop). This is why static/rigLite pets no longer
look frozen when they hit — you do NOT need Meshy rig just to get an attack motion. fullRig
skips the overlay (its clip already animates). This is free (no credits), so prefer it over
re-rigging a pet purely to fix "stiff attacks".

## Determining modelYaw (facing the opponent) — facing-lock workflow

`modelYaw` pre-rotates the mesh so the body faces the enemy after battle `lookAt`.
Valid values: `0` | `Math.PI / 2` | `-Math.PI / 2` | `Math.PI`. **No global default.**

### 正確畫面（鐵律）

| 位 | 必須 |
|---|---|
| **玩家** | 背向鏡頭、軀幹對敵（唔好跟頭／鼻） |
| **敵位** | 面向玩家／鏡頭——以**胸口寶石／眼睛／喙**為準 |

- 大尾／大翼（咖央、沙爹）正面都似「背」——**唔好**靠翼剪影判；沙爹要見胸口紅寶石／喙。
- **同一 `modelYaw` 必須兩邊啱**（`lookAt` 已對稱）。禁止 `enemyYawFlip`／敵位專用 `+π`。
- 只測玩家位＝半成品；敵位見背＝yaw 錯一檔，唔係 lookAt 壞。
- `species.ts` 有 `// facing-lock: …`＝已鎖定。**禁止順手改**；換 GLB／finalize／rig 後必須重校。

### 新精靈／換 GLB 必做

```bash
# 1) 四角校準（玩家＋敵位各 0/+90/180/-90）——用 initScript 注入 __dbgYaw
$env:DIAG_BASE="http://localhost:3000"
node scripts/diag-facing-calibrate.mjs <id>

# 2) Read test-shots/facing-cal/<id>-player-*.png
#    揀「背向鏡頭」lab；同一 lab 嘅 enemy-* 必須見正面

# 3) 寫 decisions + apply（自動加 facing-lock）
# test-shots/facing-cal/decisions.json → [{ "id":"<id>", "yaw":"0"|"+90"|"-90"|"180" }]
node scripts/apply-facing-lock.mjs

# 4) 複驗
node scripts/diag-facing-audit.mjs <id>
```

全量：`node scripts/diag-facing-audit.mjs` → `test-shots/facing-audit/`。

Pipeline 起點（仍要校準）：Tripo/static 試 `-Math.PI / 2`；Meshy-from-Tripo 試 `Math.PI / 2`。

2026-07-29 回歸：`satay-flame-emperor`／`bkt-warrior`／`prata-pup` → `0`
（舊 `+π/2` 玩家似啱、敵位見背）。`kopi-o-emperor` 維持 `+π/2`。

### 禁止事項

- 改 `BattleActor` `lookAt`／加敵位 flip 遷就單隻
- 有 facing-lock 仲改 `modelYaw`（無重跑 calibrate）
- 只跑舊 `diag-yaw-sweep` 就當驗過（改用 `diag-facing-calibrate`）
- 為修 battle 而改 showcase 固定 yaw（showcase 用 `lookAt(camera)`，見下節）

## Showcase screens must FACE THE PLAYER (use lookAt, NOT a fixed offset)

Battle points every model AT THE ENEMY so its **back faces the camera**. Non-battle "hero"
screens want the opposite — evolution success, capture success, selfie, dex hero shots should
look the player in the eye (**front to camera**).

⚠️ **DO NOT use a fixed yaw offset (e.g. `+π`).** This was a 2026-07 mistake: `+π` happened to
front `silky-chicken-warrior` (`modelYaw -π/2`) but left `laksa-dragon` (`modelYaw 0`) showing
its back. **`modelYaw` differs per species** (`0`, `±π/2`, `π`), so NO single offset works — the
same trap this skill already warns about for battle. A fixed rotation on a standalone `SpiritModel`
(incl. relying on its built-in `spin`, which stops at a back/random angle) is unreliable.

✅ **Correct, universal fix: replicate battle's `lookAt`, but aim at the CAMERA.** Battle does
`g.lookAt(enemy)` and it faces the enemy correctly for ALL species — proving `modelYaw` already
aligns each mesh's front to the group's lookAt axis. So `g.lookAt(camera)` fronts every model
regardless of `modelYaw`. Wrap `<SpiritModel spin={false} …>` in an outer group and, in `useFrame`:

```ts
const _aim = new Object3D();               // module-level scratch, not in scene
const { camera } = useThree();
// aim only in yaw (target.y = rig.y) so lookAt doesn't pitch the pet up toward the camera
_aim.position.copy(g.position);
_aim.lookAt(camera.position.x, g.position.y, camera.position.z);
// gradual turn: start back-facing, slerp toward _aim, faster in reveal/done to lock the front
g.quaternion.slerp(_aim.quaternion, Math.min(1, dt * rate));
```

See `EvolveRig` in `src/app/evolve/[uid]/page.tsx`: starts back-facing, eases to full front by
the reveal/done stage so the evolved spirit "looks at you" on completion.

### In-place species swap freezes the skeleton — `key` it to remount

`SpiritModel` swaps its GLB **in place** when `speciesId` changes (no `key`, see the `<GlbSpirit>`
return). That's fine in battle (each fighter mounts once, never swaps species). But screens that
**morph one species into another on the SAME `<SpiritModel>`** (evolution: `from → to`) hit a
`useAnimations` bug: the mixer stays bound to the OLD cloned skeleton, so the NEW skinned mesh gets
no driver and renders **frozen in bind pose** (2026-07: the evolved `chilli-crab-king`, a fullRig
pet that relies purely on its idle clip, stood dead-still while the pre-evolution rigLite pet had
animated fine via its procedural idle).

✅ **Fix: force a fresh mount with `<SpiritModel key={speciesId} … />`** on the showcase.
Remounting rebuilds `useGLTF`/`useAnimations` cleanly, the mixer binds the new skeleton, and the
idle clip drives the limbs — real skeletal motion, same as battle. Do NOT fake it with a whole-model
CSS/parent-group rotation (a left-right yaw sway is NOT what "animate like battle" means — the user
explicitly rejected that; they want the clip's limb/body motion). Verify with two frames ~1.4s apart
(`node scripts/diag-evolve-sway.mjs`): the **pose** (claws/limbs) must differ, not just the heading.

⚠️ Facing is VERIFIED, not reasoned: after any showcase-facing change run `node scripts/diag-evolve-fx.mjs`
(set `FROM=<id>` to test other species) and **Read the `-done` screenshot** — you must see the FACE
(eyes/comb/chest/weapon-in-front), never the back/tail. Verified fronting the whole roster across all
`modelYaw` values: `silky-chicken-warrior` (`0`), `laksa-dragon` (`0`), `bkt-warrior` (`0`),
`prata-sky-elephant` (`+π/2`). The fix always lives in the showcase wrapper — **never touch `modelYaw`**
(that would break battle facing).

## Static-mesh fallback (rig failed / round blob babies)

Round, limbless "blob" babies (e.g. `nasi-lemak-tot`: rice ball with a banana-leaf diaper,
arms tucked) fail Tripo/Meshy rig because pose estimation can't find limbs — and forcing an
"arms-apart" redraw ruins the cute design. Per the asset-pipeline decision tree, such a stage
should ship as a **static Tripo mesh + procedural idle**, which beats dropping to 2D.

`scripts/pipeline/stages/finalize.mjs` now does this automatically: if there is no
`model-pipeline/gen/anim/<id>/idle.glb` but a `model-pipeline/gen/tripo/<id>.glb` exists, it
Draco-compresses that static mesh straight to `public/models/<id>.glb` (~200 KB) and sets
static flags. To do it by hand:
```bash
npx gltf-transform optimize "model-pipeline/gen/tripo/<id>.glb" "public/models/<id>.glb" \
  --compress draco --texture-compress webp --texture-size 1024 --no-flatten --no-join --simplify false
```
Static species pattern in `species.ts` — **`animated: false`, no `rigLite`**, keep `modelYaw`:
```ts
modelUrl: "/models/<id>.glb", modelHeightM: 0.3, modelYaw: -Math.PI / 2,
```
This still animates: `SpiritModel` computes `fullRig = animated && !rigLite`, and the
procedural idle-float / hit-shake / **windup-lunge attack** runs whenever `!fullRig` — so a
static model still bobs, reacts and lunges on attack, it just has no skeletal clips.

## Pipeline rig routing (Meshy-first, auto-fallback)

`scripts/pipeline/stages/rig.mjs` now routes by the concept's `bodyPlan` (see the
`spirit-asset-pipeline` skill) to get lively attacks WITHOUT forcing every pet humanoid:
1. `bodyPlan.rig === "meshy"` (all upright-biped species forms) → **Meshy auto-rig first**:
   `rotate-glb.mjs <tripo>.glb <tripo>.rot.glb -90` → `rig-animate.mjs --src=tripo --glb=<rot>`
   → fullRig (`modelYaw: +π/2`). This is the only tier with real limb-swinging clips.
2. Meshy fails (422 / pose not found) → **Tripo rig** (`tripo-rig-animate.mjs`) → rigLite (`-π/2`).
3. `bodyPlan.rig === "static"` (round blob babies) → skip rig → `finalize.mjs` static mesh.

`rig.mjs` records `draft.artifacts.rigModeByStage[id] = "meshy" | "tripo"`; `finalize.mjs`
reads it to set the correct flags + `modelYaw` (never hand-set these for generated pets — the
pipeline does, and marks `needsYawVerification` for a diag pass before publish).

⚠️ **Re-run gotcha (fixed 2026-07):** `rig.mjs` decides Meshy-success by `existsSync(anim/<id>/idle.glb)`.
On a RE-RUN of the same id, a stale `idle.glb` left by a previous Tripo fallback made a fresh
Meshy 422 look like a Meshy success (→ pet wrongly flagged fullRig with `+π/2`, but the GLB is
Tripo-rigged → drifts + mis-faces). `rig.mjs` now `rmSync`-cleans `anim/<id>` before each rig
attempt (Meshy/Tripo re-download from the `tasks-anim.json` cache, no re-charge). Fresh weekly
runs (unique ids, empty anim dir) were never affected — only same-id re-runs.

## Verify a whole-roster or single fix

```bash
npm run facing:static                       # Gate A（必過）
npm run facing:diff                         # Gate B→C（敏感 diff）
npm run facing:golden                       # Gate C 抽樣
npm run facing:golden:write                 # 更新 golden baseline（要 :3000）
node scripts/diag-facing-audit.mjs          # 人手目視審計
node scripts/diag-facing-calibrate.mjs <id> # 四角校準
```

## Model size (`modelHeightM`) — scale by evolution stage

`GlbSpirit` normalises every model so its **rendered height equals `modelHeightM`**
(`s = heightM / bboxHeight`), independent of the raw mesh. So `modelHeightM` alone controls
on-screen size, and it MUST grow with evolution stage to match same-stage opponents:

| stage | `modelHeightM` | examples |
|---|---|---|
| 1 (baby)   | ~0.25–0.35 | `bkt-cub` 0.35, `chendol-jelly` 0.25 |
| 2 (warrior)| ~0.48–0.52 | `bkt-warrior` 0.5 |
| 3 (final)  | ~0.62–0.66 | `bkt-grandmaster` 0.65 |

⚠️ **Bug fixed 2026-07**: the pipeline's `finalize.mjs` used to hardcode `modelHeightM: 0.3`
for **every** stage, so generated stage-2/3 pets rendered at ~half the height of same-stage
opponents (e.g. `nasi-lemak-general` looked tiny next to `bkt-grandmaster`). `finalize.mjs`
now uses `heightForStage(stage)` (`{1:0.3, 2:0.5, 3:0.65}`). If you find an already-published
generated pet that looks small, check its `modelHeightM` against this table first.

## Environment / gotchas

- Dev server: **`http://localhost:3000`**（diag 用 `$env:DIAG_BASE`） (use `localhost`, not `127.0.0.1` — see
  `.cursor/rules/local-diagnostics.mdc`). Playwright: `--enable-unsafe-swiftshader`,
  `waitUntil: "domcontentloaded"`.
- After swapping a GLB in `public/models/`, hard-refresh (Ctrl+F5) to bust the cache;
  the `/dev/model` viewer's idle frame can look empty even when `/battle` renders fine —
  trust the battle scene.
- Battle positioning: `PLAYER_POS`/`ENEMY_POS` + `g.lookAt(target)` per frame in
  `src/app/battle/page.tsx`. Never write `g.rotation.*` after `lookAt` (euler decomposition
  flips past 90°). Facing correction belongs in `modelYaw`, not the battle group.
