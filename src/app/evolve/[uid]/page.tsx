"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Object3D } from "three";
import type { Group } from "three";
import { SPECIES_MAP } from "@/content/species";
import { ELEMENT_INFO } from "@/content/elements";
import { useGameStore } from "@/lib/store";
import SpiritModel from "@/components/three/SpiritModel";
import Confetti from "@/components/Confetti";
import { sfxAppear, sfxEvolve, sfxShiny, sfxStruggleTick, sfxTap } from "@/lib/sfx";
import { buzz } from "@/lib/sfx";
import { track } from "@/lib/analytics/track";

// 進化演出五幕（獎勵三幕結構「蓄勢→變形→揭曉」+ 懸念一拍 + 慶祝定格）：
//  charging(蓄勢 1.9s)  → 美食粒子螺旋匯聚、內發光心跳加速
//  morphing(變形 2.0s)  → 純白剪影，新舊形態加速交替閃（間隔遞減）＋白閃遮 model swap
//  suspense(懸念 0.4s)  → 近黑凝住、聲音抽走，dopamine 拉滿
//  reveal(揭曉 1.1s)    → 白金爆閃、新形態彈簧 scale-in、衝擊波環、五行光柱、粒子爆散
//  done(慶祝)           → 名字彈出、Confetti、金光回落，出「繼續」掣
// shiny 版全程用虹彩取代五行主色，揭曉補 sfxShiny＋星粒爆散。
type Stage = "pending" | "charging" | "morphing" | "suspense" | "reveal" | "done" | "invalid";

const T_MORPH = 1900;
const T_SUSPENSE = 3900;
const T_REVEAL = 4300;
const T_DONE = 5500;

// 面向鏡頭：唔可以用固定 yaw offset（每隻 modelYaw 唔同，+π 對某啲啱、某啲變背向）。
// 正解係照抄 battle 個 lookAt 機制——battle g.lookAt(敵人) 令寵物正面對敵人，
// 證明 modelYaw 已將每隻嘅「正面」對齊到 group 嘅 lookAt 軸；所以 lookAt(鏡頭) 就通用地
// 令任何一隻都正面對玩家。⚠️ 朝向唔靠估：改完一定要用 diag 截多隻肉眼校準（見 SKILL）。
const _aim = new Object3D(); // 每 frame 借嚟計「望住鏡頭」嘅目標朝向，唔入 scene

/** 蓄勢：美食粒子由四周螺旋匯聚入精靈 */
function ConvergeField({ color, shiny }: { color: string; shiny: boolean }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const ang = (i / 30) * Math.PI * 2 + Math.random() * 0.6;
        const dist = 150 + Math.random() * 170;
        return {
          sx: Math.cos(ang) * dist,
          sy: Math.sin(ang) * dist,
          delay: (i / 30) * 1.3,
          dur: 1.0 + Math.random() * 0.7,
          size: 6 + Math.random() * 9,
          round: Math.random() > 0.5,
        };
      }),
    []
  );
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex items-center justify-center ${shiny ? "ev-hue" : ""}`}
    >
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute"
          style={
            {
              width: p.size,
              height: p.size,
              borderRadius: p.round ? "9999px" : "3px",
              background: shiny ? "#fff" : color,
              boxShadow: `0 0 9px ${shiny ? "#ffffff" : color}`,
              "--sx": `${p.sx}px`,
              "--sy": `${p.sy}px`,
              animation: `ev-converge ${p.dur}s ease-in ${p.delay}s infinite`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** 揭曉：星粒／光點由中心爆散飛出 */
function BurstField({ color, star }: { color: string; star: boolean }) {
  const parts = useMemo(
    () =>
      Array.from({ length: star ? 20 : 16 }, (_, i) => {
        const ang = (i / (star ? 20 : 16)) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 120 + Math.random() * 180;
        return {
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist,
          delay: Math.random() * 0.12,
          size: star ? 12 + Math.random() * 12 : 5 + Math.random() * 6,
        };
      }),
    [star]
  );
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex items-center justify-center ${star ? "ev-hue" : ""}`}
    >
      {parts.map((p, i) =>
        star ? (
          <span
            key={i}
            className="absolute font-black leading-none text-gold-light"
            style={
              {
                fontSize: p.size,
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                textShadow: "0 0 8px #fff",
                animation: `ev-burst 0.9s cubic-bezier(0.2,0.7,0.3,1) ${p.delay}s both`,
              } as CSSProperties
            }
          >
            ✦
          </span>
        ) : (
          <span
            key={i}
            className="absolute rounded-full"
            style={
              {
                width: p.size,
                height: p.size,
                background: color,
                boxShadow: `0 0 10px ${color}`,
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                animation: `ev-burst 0.85s cubic-bezier(0.2,0.7,0.3,1) ${p.delay}s both`,
              } as CSSProperties
            }
          />
        )
      )}
    </div>
  );
}

/**
 * 進化演出朝向控制：外層 wrapper 每 frame ease 個 yaw，
 * 由背向鏡頭（0）逐幕慢慢轉向正面（FACE_YAW），reveal/done 定格對正玩家（睇住你）。
 * spin 交由呢度控制，唔用 SpiritModel 內置 spin（嗰個會停喺隨機角度＝背住你）。
 */
function EvolveRig({
  speciesId,
  shiny,
  flashKey,
  stage,
}: {
  speciesId: string;
  shiny: boolean;
  flashKey: number;
  stage: Stage;
}) {
  const rig = useRef<Group>(null);
  const { camera } = useThree();
  const inited = useRef(false);
  useFrame((_, dt) => {
    const g = rig.current;
    if (!g) return;
    // 目標朝向＝望住鏡頭（只轉 yaw：target.y 對齊自身高度，避免 lookAt 連 pitch 令寵物仰起）
    _aim.position.copy(g.position);
    _aim.lookAt(camera.position.x, g.position.y, camera.position.z);
    if (!inited.current) {
      // 起手先背向鏡頭，等佢喺演出途中慢慢轉埋嚟
      g.quaternion.copy(_aim.quaternion);
      g.rotateY(Math.PI);
      inited.current = true;
      return;
    }
    // 逐幕加快 slerp：蓄勢/變形慢慢轉 → 揭曉/完成鎖實正面「睇住你」
    const rate = stage === "reveal" || stage === "done" ? 8 : stage === "suspense" ? 4 : 2.2;
    g.quaternion.slerp(_aim.quaternion, Math.min(1, dt * rate));
  });
  return (
    <group ref={rig}>
      <group position={[0, -0.3, 0]}>
        {/*
          key={speciesId}：進化後嘅寵物一定要「重新 mount」先郁得起。
          唔加 key 就係原地換 GLB，useAnimations 個 mixer 仲綁住舊骨架，
          新 skinned mesh 冇嘢驅動 → 進化後隻寵物定格喺 bind pose（靜止）。
          remount 令 useGLTF／useAnimations 乾淨重建，idle clip 真正驅動手腳，
          同切磋一樣有骨架動作（fullRig 尤其明顯，佢淨靠 clip 唔靠程序化 idle）。
        */}
        <SpiritModel
          key={speciesId}
          speciesId={speciesId}
          spin={false}
          shiny={shiny}
          flashKey={flashKey}
        />
      </group>
    </group>
  );
}

export default function EvolvePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = use(params);
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const fromSpeciesId = useRef("");
  const toSpeciesId = useRef("");
  const shinyRef = useRef(false);

  const [stage, setStage] = useState<Stage>("pending");
  const [progress, setProgress] = useState(0);
  const [altShow, setAltShow] = useState(false); // 變形期交替顯示新形態
  const [flashKey, setFlashKey] = useState(0); // model 內置白閃重播 key
  const executed = useRef(false);

  useEffect(() => {
    const spirit = useGameStore.getState().ownedSpirits.find((s) => s.uid === uid);
    const to = spirit ? (SPECIES_MAP[spirit.speciesId]?.evolvesTo ?? "") : "";
    if (!spirit || !to) {
      setStage("invalid");
      return;
    }
    fromSpeciesId.current = spirit.speciesId;
    toSpeciesId.current = to;
    shinyRef.current = Boolean(spirit.shiny);
    setStage("charging");

    const timers: ReturnType<typeof setTimeout>[] = [];
    sfxAppear();
    timers.push(setTimeout(() => setStage("morphing"), T_MORPH));
    timers.push(setTimeout(() => setStage("suspense"), T_SUSPENSE));
    timers.push(
      setTimeout(() => {
        // model swap 藏喺白閃入面：呢一刻先真正寫入 store（executed 保證一次）
        if (!executed.current) {
          executed.current = true;
          useGameStore.getState().evolveSpirit(uid);
          track("evolve", { fromSpeciesId: fromSpeciesId.current, toSpeciesId: toSpeciesId.current });
        }
        setStage("reveal");
        setFlashKey((k) => k + 1);
        sfxEvolve();
        if (shinyRef.current) sfxShiny();
        buzz([90, 40, 60, 40, 220]);
      }, T_REVEAL)
    );
    timers.push(setTimeout(() => setStage("done"), T_DONE));

    const int = setInterval(() => setProgress((p) => Math.min(100, p + 2.2)), 80);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(int);
    };
  }, [uid]);

  // 變形期：新舊形態加速交替閃（間隔 380ms → 70ms），每次翻面補白閃＋升調 tick
  useEffect(() => {
    if (stage !== "morphing") return;
    let alt = false;
    let interval = 380;
    let ticks = 0;
    let timer: ReturnType<typeof setTimeout>;
    const flip = () => {
      alt = !alt;
      ticks++;
      setAltShow(alt);
      setFlashKey((k) => k + 1);
      sfxStruggleTick(Math.min(1, ticks / 10)); // 交替越快音越高＝張力
      interval = Math.max(70, interval * 0.8);
      timer = setTimeout(flip, interval);
    };
    timer = setTimeout(flip, interval);
    return () => clearTimeout(timer);
  }, [stage]);

  // invalid 用 effect 導航（避免 render 期間觸發 router）
  useEffect(() => {
    if (stage === "invalid") router.replace("/dex");
  }, [stage, router]);

  if (stage === "pending" || stage === "invalid") return null;

  const isShiny = shinyRef.current;
  const showSpeciesId =
    stage === "reveal" || stage === "done"
      ? toSpeciesId.current
      : stage === "morphing" && altShow
        ? toSpeciesId.current
        : fromSpeciesId.current;
  const toSpecies = SPECIES_MAP[toSpeciesId.current];
  const element = SPECIES_MAP[fromSpeciesId.current]?.element ?? "fire";
  const mainColor = ELEMENT_INFO[element].color;

  // 每幕嘅 model 濾鏡：蓄勢內發光 → 變形純白/虹彩剪影 → 懸念近黑 → 揭曉璀璨
  const modelFilter =
    stage === "charging"
      ? `drop-shadow(0 0 26px ${mainColor}) brightness(1.25) saturate(1.1)`
      : stage === "morphing"
        ? isShiny
          ? "brightness(2.4) saturate(1.6) contrast(1.1)"
          : "brightness(3.6) saturate(0)"
        : stage === "suspense"
          ? "brightness(0.12) saturate(0.3)"
          : `drop-shadow(0 0 34px ${mainColor}) brightness(1.15)`;

  const beamGradient = isShiny
    ? "linear-gradient(to top, rgba(255,255,255,0.9), rgba(255,120,220,0.5) 40%, transparent)"
    : `linear-gradient(to top, ${mainColor}, ${mainColor}88 40%, transparent)`;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden pb-[calc(70px_+_env(safe-area-inset-bottom))] items-center justify-center overflow-hidden bg-[#0a0612]">
      {/* 進化演出專用 keyframes（component-scoped，唔改 globals） */}
      <style>{`
        @keyframes ev-converge { 0%{ transform: translate(var(--sx),var(--sy)) scale(1); opacity:0 } 18%{opacity:1} 100%{ transform: translate(0,0) scale(0.25); opacity:0 } }
        @keyframes ev-burst { 0%{ transform: translate(0,0) scale(0.4); opacity:0 } 15%{opacity:1} 100%{ transform: translate(var(--dx),var(--dy)) scale(1); opacity:0 } }
        @keyframes ev-hue { to { filter: hue-rotate(360deg) } }
        .ev-hue { animation: ev-hue 1.1s linear infinite; }
        @keyframes ev-heartbeat { 0%,100%{ transform: scale(1) } 50%{ transform: scale(1.06) } }
        @keyframes ev-reveal-pop { 0%{ transform: scale(0.5); opacity:0 } 55%{ transform: scale(1.16); opacity:1 } 78%{ transform: scale(0.96) } 100%{ transform: scale(1) } }
        @keyframes ev-flash { 0%{ opacity:0 } 12%{ opacity:1 } 100%{ opacity:0 } }
        @keyframes ev-beam { 0%{ transform: scaleY(0); opacity:0 } 25%{ opacity:1 } 100%{ transform: scaleY(1); opacity:0 } }
        @keyframes ev-suspense-in { from{ opacity:0 } to{ opacity:1 } }
        @keyframes ev-rim { 0%{ opacity:0.9 } 100%{ opacity:0.35 } }
      `}</style>

      {/* 旋轉光暈背景（蓄勢/變形/揭曉都轉，越後越亮） */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`spin-slow h-[135vw] w-[135vw] rounded-full ${isShiny ? "ev-hue" : ""}`}
          style={{
            opacity: stage === "suspense" ? 0.15 : stage === "reveal" || stage === "done" ? 0.85 : 0.6,
            transition: "opacity 0.5s",
            background: isShiny
              ? "conic-gradient(from 0deg, transparent, rgba(255,120,220,0.4) 60deg, transparent 120deg, rgba(120,200,255,0.4) 200deg, transparent 260deg, rgba(255,240,120,0.4) 320deg, transparent)"
              : `conic-gradient(from 0deg, transparent, ${mainColor}55 50deg, transparent 100deg, ${mainColor}88 160deg, transparent 220deg, ${mainColor}44 300deg, transparent)`,
            filter: "blur(6px)",
          }}
        />
      </div>

      {/* 蓄勢：美食粒子匯聚 */}
      {stage === "charging" && <ConvergeField color={mainColor} shiny={isShiny} />}

      {/* 揭曉：衝擊波環 ×3 ＋五行光柱 ＋粒子爆散 */}
      {(stage === "reveal" || stage === "done") && (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.12, 0.24].map((d) => (
              <div
                key={d}
                className="burst-ring absolute h-72 w-72 rounded-full border-8"
                style={{ borderColor: isShiny ? "#fff" : mainColor, animationDelay: `${d}s` }}
              />
            ))}
          </div>
          {/* 腳底沖天光柱 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 flex justify-center">
            <div
              className="h-full w-40 origin-bottom"
              style={{ background: beamGradient, animation: "ev-beam 1s ease-out both", filter: "blur(3px)" }}
            />
          </div>
          {stage === "reveal" && <BurstField color={mainColor} star={isShiny} />}
        </>
      )}

      {/* 懸念：近黑幕淡入 */}
      {stage === "suspense" && (
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ animation: "ev-suspense-in 0.4s ease-in both", opacity: 0.82 }}
        />
      )}

      {/* 精靈模型：外層管濾鏡＋心跳，內層管揭曉彈簧 pop */}
      <div className="relative z-10 h-72 w-72" style={{ filter: modelFilter, transition: "filter 0.3s" }}>
        <div
          className={stage === "charging" ? "h-full w-full" : "h-full w-full"}
          style={{
            animation:
              stage === "reveal" || stage === "done"
                ? "ev-reveal-pop 0.9s cubic-bezier(0.34,1.56,0.64,1) both"
                : stage === "charging"
                  ? "ev-heartbeat 0.7s ease-in-out infinite"
                  : undefined,
          }}
        >
          <Canvas camera={{ fov: 45, position: [0, 0.45, 1.5] }} gl={{ alpha: true }}>
            <ambientLight intensity={1.4} />
            <directionalLight position={[2, 4, 2]} intensity={1.5} />
            <EvolveRig
              speciesId={showSpeciesId}
              shiny={isShiny}
              flashKey={flashKey}
              stage={stage}
            />
          </Canvas>
        </div>
      </div>

      {/* 揭曉一刻全屏白金爆閃（蓋住 model swap） */}
      {stage === "reveal" && (
        <div
          key={`flash-${flashKey}`}
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, #ffffff 0%, rgba(255,240,190,0.85) 35%, transparent 70%)",
            animation: "ev-flash 0.6s ease-out both",
          }}
        />
      )}

      {stage === "done" && <Confetti count={28} />}

      {/* 文字 + 進度 */}
      <div className="z-10 mt-6 flex min-h-32 flex-col items-center gap-3 px-8">
        {stage === "charging" || stage === "morphing" ? (
          <>
            <h1 className="text-3xl font-black tracking-widest text-gold-light">
              {t("evolution.evolving")}
            </h1>
            <div className="h-4 w-64 overflow-hidden rounded-full border-2 border-gold bg-black/50">
              <div
                className="h-full bg-gradient-to-r from-gold to-gold-light transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gold-light/80">{Math.round(progress)}%</span>
          </>
        ) : stage === "done" ? (
          <>
            <h1
              className="text-4xl font-black text-gold-light drop-shadow-[0_0_20px_rgba(232,200,96,0.8)]"
              style={{ animation: "ev-reveal-pop 0.7s cubic-bezier(0.34,1.56,0.64,1) both" }}
            >
              {t("evolution.success")}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-white">{toSpecies?.name[locale]}</p>
              {isShiny && (
                <span className="shiny-badge rounded-full px-2.5 py-0.5 text-xs font-black text-ink">
                  ✦
                </span>
              )}
            </div>
            <p className="text-sm text-gold-light/70">{t("evolution.newForm")}</p>
            <button
              onClick={() => {
                sfxTap();
                router.push(`/dex/${toSpeciesId.current}`);
              }}
              className="btn-gold mt-3 px-10 py-3.5 text-lg font-black"
            >
              {t("common.continue")}
            </button>
          </>
        ) : null}
      </div>
    </main>
  );
}
