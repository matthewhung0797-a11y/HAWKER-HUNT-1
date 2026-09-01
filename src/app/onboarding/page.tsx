"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import {
  sfxAppear,
  sfxCapture,
  sfxFrenzy,
  sfxGrade,
  sfxMiss,
  sfxStruggleTick,
} from "@/lib/sfx";

/**
 * 新手導覽（骨茶宗師教「筷子功」）：唔用靜態幻燈片，行「邊玩邊學」——
 * 對話帶入世界觀 → 實習第一課「睇準時機」（縮圈）→ 第二課「狂撳夾實」
 * （中途插一波迷你狂暴＝twist）→ 捉到即慶祝 → 講明去邊搵精靈 → 出發。
 * 全程有 Skip；實習永遠唔會失敗死局（夾實度有下限），俾新手安全練手。
 */

/** 導師＋練手目標（全部用現成立繪，冇新素材）；練手對象＝辣椒仔 */
const MENTOR_IMG = "/spirits/full/bkt-grandmaster.webp";
const TARGET_IMG = "/spirits/full/chilli-baby.webp";

/** 縮圈：金圈由 2.2 縮到 0.55，貼住紅圈（=1.0）±呢個容忍就算成功（新手放寬） */
const RING_MAX = 2.2;
const RING_MIN = 0.55;
const RING_CYCLE_MS = 2600;
const AIM_TOLERANCE = 0.18;

/** 迷你搏鬥：起手 45、流失 12/s（狂暴 20/s）、每撳 +9（狂暴 +4）；下限 15＝教學唔會輸 */
const MASH_START = 45;
const MASH_DRAIN = 12;
const MASH_DRAIN_FRENZY = 20;
const MASH_PER_TAP = 9;
const MASH_PER_TAP_FRENZY = 4;
const MASH_FLOOR = 15;
const FRENZY_AT = 70;
const FRENZY_MS = 1400;

type Scene = "hello" | "aim" | "mash" | "caught" | "world";

/** 金色捲葉花紋分隔線（Peranakan 風） */
function Flourish() {
  return (
    <svg viewBox="0 0 200 16" className="h-4 w-44 text-gold" aria-hidden>
      <path d="M4 8h56M140 8h56" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M66 8c6-7 12-7 16 0s10 7 18 0c-8-7-14-7-18 0s-10 7-16 0Z"
        fill="currentColor"
        opacity="0.9"
      />
      <circle cx="100" cy="8" r="3.4" fill="#d84a2f" />
      <circle cx="60" cy="8" r="1.8" fill="currentColor" />
      <circle cx="140" cy="8" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** 打字機對話泡泡：逐字出，撳一下先出晒、再撳先去下一句 */
function useTypewriter(text: string, speedMs = 26) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const iv = setInterval(() => setN((v) => v + 1), speedMs);
    return () => clearInterval(iv);
  }, [text, speedMs]);
  const done = n >= text.length;
  return { shown: done ? text : text.slice(0, n), done, reveal: () => setN(text.length) };
}

/** 宗師對話泡泡（帶名牌＋繼續提示） */
function MentorBubble({
  name,
  text,
  done,
  hint,
}: {
  name: string;
  text: string;
  done: boolean;
  hint?: string;
}) {
  return (
    <div className="w-full max-w-sm">
      <span className="ml-3 inline-block rounded-t-xl border-2 border-b-0 border-ink/20 bg-gold px-3 py-0.5 text-xs font-black text-ink">
        {name}
      </span>
      <div className="rounded-2xl rounded-tl-none border-2 border-ink/20 bg-white/95 px-4 py-3 shadow-lg">
        <p className="min-h-12 text-[15px] font-bold leading-relaxed text-ink">{text}</p>
        {done && hint && (
          <p className="onb-blink mt-1 text-right text-xs font-bold text-ink-soft">{hint} ▸</p>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const t = useTranslations();
  const router = useRouter();
  const completeOnboarding = useGameStore((s) => s.completeOnboarding);

  const [scene, setScene] = useState<Scene>("hello");
  const [line, setLine] = useState(0);

  // ── 第一課：縮圈 ──
  const ringRef = useRef<HTMLDivElement | null>(null);
  const ringScaleRef = useRef(RING_MAX);
  const [aimMisses, setAimMisses] = useState(0);
  const [aimHit, setAimHit] = useState(false);

  // ── 第二課：狂撳 ──
  const gripRef = useRef(MASH_START);
  const [grip, setGrip] = useState(MASH_START);
  const [frenzy, setFrenzy] = useState(false);
  const frenzyDoneRef = useRef(false);
  const [squishKey, setSquishKey] = useState(0);
  const rafRef = useRef(0);

  const finish = useCallback(() => {
    completeOnboarding();
    router.push("/login");
  }, [completeOnboarding, router]);

  // 對話內容（hello 場景三句）
  const helloLines = [t("onboarding.g1"), t("onboarding.g2"), t("onboarding.g3")];
  const tw = useTypewriter(
    scene === "hello"
      ? helloLines[line]
      : scene === "aim"
        ? t("onboarding.aimHint")
        : scene === "mash"
          ? t("onboarding.mashHint")
          : scene === "caught"
            ? t("onboarding.g4")
            : t("onboarding.g5")
  );

  const nextHello = () => {
    try {
      if (!tw.done) return tw.reveal();
      if (line < helloLines.length - 1) setLine(line + 1);
      else {
        try { sfxAppear(); } catch (e) { console.warn("[onboarding] sfxAppear failed:", e); }
        setScene("aim");
      }
    } catch (e) {
      console.error("[onboarding] nextHello error:", e);
      setScene("aim");
    }
  };

  // 縮圈動畫（aim 場景）：raf 寫 transform，唔經 React state
  useEffect(() => {
    if (scene !== "aim" || aimHit) return;
    let prog = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      prog = (prog + (now - last) / RING_CYCLE_MS) % 1;
      last = now;
      const s = RING_MAX - (RING_MAX - RING_MIN) * prog;
      ringScaleRef.current = s;
      const el = ringRef.current;
      if (el) {
        el.style.transform = `scale(${s})`;
        el.dataset.s = s.toFixed(3); // 診斷腳本讀嚟校時機
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene, aimHit]);

  const onAimTap = () => {
    if (aimHit) return;
    const diff = Math.abs(ringScaleRef.current - 1);
    if (diff <= AIM_TOLERANCE) {
      try { sfxGrade("great"); } catch (e) { console.warn("[onboarding] sfxGrade failed:", e); }
      setAimHit(true);
      // 定格一下俾玩家見到成功，先入第二課
      setTimeout(() => {
        gripRef.current = MASH_START;
        setGrip(MASH_START);
        frenzyDoneRef.current = false;
        setScene("mash");
      }, 900);
    } else {
      try { sfxMiss(); } catch (e) { console.warn("[onboarding] sfxMiss failed:", e); }
      setAimMisses((m) => m + 1);
    }
  };

  // 迷你搏鬥 loop（mash 場景）：流失＋狂暴一波；有下限唔會輸。
  // 狂暴計時用 ref（effect 唔可以依賴 frenzy state，否則一觸發即重啟 effect 令計時歸零）
  const frenzyUntilRef = useRef(0);
  useEffect(() => {
    if (scene !== "mash") return;
    let last = performance.now();
    frenzyUntilRef.current = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const inFrenzy = now < frenzyUntilRef.current;
      // 夾實度升穿門檻 → 插一波迷你狂暴（每次教學一次＝twist）
      if (!inFrenzy && !frenzyDoneRef.current && gripRef.current >= FRENZY_AT) {
        frenzyDoneRef.current = true;
        frenzyUntilRef.current = now + FRENZY_MS;
        setFrenzy(true);
        try { sfxFrenzy(); } catch (e) { console.warn("[onboarding] sfxFrenzy failed:", e); }
      } else if (!inFrenzy && frenzyDoneRef.current) {
        setFrenzy(false); // 同值 setState React 會 bail out，唔會狂 re-render
      }
      const drain = inFrenzy ? MASH_DRAIN_FRENZY : MASH_DRAIN;
      gripRef.current = Math.max(MASH_FLOOR, gripRef.current - drain * dt);
      setGrip(gripRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scene]);

  const onMashTap = () => {
    if (scene !== "mash") return;
    const per = frenzy ? MASH_PER_TAP_FRENZY : MASH_PER_TAP;
    gripRef.current = Math.min(100, gripRef.current + per);
    setGrip(gripRef.current);
    setSquishKey((k) => k + 1);
    try { sfxStruggleTick(gripRef.current / 100); } catch (e) { console.warn("[onboarding] sfxStruggleTick failed:", e); }
    // 加滿一刻即判捉到（唔可以留返俾 raf loop 判——佢每 frame 先流失後檢查，永遠差少少）
    if (gripRef.current >= 100) {
      cancelAnimationFrame(rafRef.current);
      setFrenzy(false);
      try { sfxCapture(); } catch (e) { console.warn("[onboarding] sfxCapture failed:", e); }
      setScene("caught");
    }
  };

  const dark = scene === "aim" || scene === "mash" || scene === "caught";
  const sceneIdx = { hello: 0, aim: 1, mash: 2, caught: 3, world: 4 }[scene];

  return (
    <main
      className={`relative flex min-h-dvh flex-col overflow-hidden ${
        dark ? "bg-gradient-to-b from-[#2a1a0c] to-[#4a2c14]" : "paper-texture bg-parchment"
      }`}
    >
      {/* 教學專用 keyframes */}
      <style>{`
        @keyframes onb-wobble { 0%,100%{transform:rotate(-4deg) translateX(-3px)} 50%{transform:rotate(4deg) translateX(3px)} }
        @keyframes onb-wobble-mad { 0%,100%{transform:rotate(-8deg) translateX(-6px) scale(1.04)} 50%{transform:rotate(8deg) translateX(6px) scale(1.04)} }
        @keyframes onb-squish { 0%{transform:scale(1)} 35%{transform:scale(0.86,0.92)} 100%{transform:scale(1)} }
        @keyframes onb-blink { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .onb-blink { animation: onb-blink 1.2s ease-in-out infinite; }
        @keyframes onb-pop { 0%{transform:scale(0.4);opacity:0} 70%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
        .onb-pop { animation: onb-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>

      {/* 場景進度（銅錢圓點） */}
      <div className="flex items-center justify-center gap-2 pt-[max(1.25rem,env(safe-area-inset-top))]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="rounded-full transition-all"
            style={{
              width: i === sceneIdx ? 22 : 8,
              height: 8,
              background:
                i === sceneIdx
                  ? "linear-gradient(90deg,#e8c860,#c9a227)"
                  : dark
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(74,44,20,0.22)",
            }}
          />
        ))}
      </div>

      {/* ── 場景 1：宗師出場對白 ── */}
      {scene === "hello" && (
        <button
          data-no-press-sfx
          data-testid="onb-hello"
          onClick={nextHello}
          className="flex flex-1 cursor-pointer flex-col items-center justify-end px-6 pb-10 text-left"
        >
          <div className="onb-pop mb-2 flex w-full justify-center">
            <MentorBubble
              name={t("onboarding.mentorName")}
              text={tw.shown}
              done={tw.done}
              hint={t("onboarding.tapNext")}
            />
          </div>
          <img
            src={MENTOR_IMG}
            alt=""
            draggable={false}
            className="float-bob h-72 w-auto drop-shadow-[0_16px_22px_rgba(0,0,0,0.35)]"
          />
        </button>
      )}

      {/* ── 場景 2：第一課 睇準時機（縮圈實習） ── */}
      {scene === "aim" && (
        <div className="flex flex-1 flex-col items-center px-6">
          <span className="mt-3 rounded-full bg-gold px-4 py-1 text-xs font-black text-ink">
            {t("onboarding.lesson1")}
          </span>
          <h1 className="mt-1.5 text-2xl font-black text-gold-light">{t("onboarding.aimTitle")}</h1>

          <div className="relative mt-4 flex h-72 w-72 items-center justify-center">
            {/* 紅圈（甜蜜點） */}
            <div className="absolute h-44 w-44 rounded-full border-[3px] border-[#d84a2f] shadow-[0_0_14px_rgba(216,74,47,0.5)]" />
            {/* 金圈（raf 縮） */}
            <div
              ref={ringRef}
              data-testid="onb-ring"
              className="absolute h-44 w-44 rounded-full border-4 border-gold-light shadow-[0_0_18px_rgba(232,200,96,0.55)]"
            />
            <button
              data-no-press-sfx
              data-testid="onb-aim-tap"
              onClick={onAimTap}
              aria-label={t("onboarding.aimTitle")}
              className="relative z-10 flex h-40 w-40 items-center justify-center"
            >
              <img
                src={TARGET_IMG}
                alt=""
                draggable={false}
                className={`h-32 w-auto ${aimHit ? "" : "float-bob"}`}
              />
            </button>
            {aimHit && (
              <span
                data-testid="onb-aim-good"
                className="onb-pop absolute top-2 rounded-full bg-gold px-4 py-1.5 text-lg font-black text-ink shadow-lg"
              >
                {t("onboarding.aimGood")}
              </span>
            )}
          </div>

          <div className="mt-2 flex w-full justify-center">
            <div className="flex max-w-sm items-end gap-2">
              <img src={MENTOR_IMG} alt="" draggable={false} className="h-16 w-auto shrink-0" />
              <MentorBubble
                name={t("onboarding.mentorName")}
                text={
                  aimMisses > 0 && !aimHit
                    ? t(aimMisses % 2 === 1 ? "onboarding.aimMiss1" : "onboarding.aimMiss2")
                    : tw.shown
                }
                done
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 場景 3：第二課 狂撳夾實（迷你搏鬥＋一波狂暴） ── */}
      {scene === "mash" && (
        <div className="flex flex-1 flex-col items-center px-6">
          <span className="mt-3 rounded-full bg-gold px-4 py-1 text-xs font-black text-ink">
            {t("onboarding.lesson2")}
          </span>
          <h1 className="mt-1.5 text-2xl font-black text-gold-light">{t("onboarding.mashTitle")}</h1>

          {frenzy && (
            <span
              data-testid="onb-frenzy"
              className="onb-pop mt-2 rounded-full bg-[#d84a2f] px-4 py-1.5 text-base font-black text-white shadow-[0_0_16px_rgba(216,74,47,0.8)]"
            >
              {t("onboarding.frenzyBanner")}
            </span>
          )}

          <button
            data-no-press-sfx
            data-testid="onb-mash-tap"
            onClick={onMashTap}
            aria-label={t("onboarding.mashTitle")}
            className="relative mt-4 flex h-64 w-64 items-center justify-center"
          >
            <div key={squishKey} style={{ animation: "onb-squish 0.16s ease-out" }}>
              <div
                style={{
                  animation: `${frenzy ? "onb-wobble-mad 0.22s" : "onb-wobble 0.5s"} ease-in-out infinite`,
                }}
              >
                <img
                  src={TARGET_IMG}
                  alt=""
                  draggable={false}
                  className={`h-40 w-auto ${frenzy ? "drop-shadow-[0_0_18px_rgba(216,74,47,0.9)]" : "drop-shadow-[0_10px_16px_rgba(0,0,0,0.5)]"}`}
                />
              </div>
            </div>
          </button>

          {/* 夾實度 gauge（同捕捉頁同一套視覺語言） */}
          <div className="w-full max-w-xs">
            <div className="h-4 w-full overflow-hidden rounded-full border-2 border-ink/30 bg-black/40">
              <div
                data-testid="onb-grip"
                className="h-full rounded-full transition-[width] duration-100"
                style={{
                  width: `${grip}%`,
                  background: frenzy
                    ? "linear-gradient(90deg,#d84a2f,#f08050)"
                    : "linear-gradient(90deg,#e8c860,#c9a227)",
                }}
              />
            </div>
            <p className="mt-1 text-center text-xs font-bold text-white/80">
              {t("onboarding.gripLabel")}
            </p>
          </div>

          <div className="mt-3 flex w-full justify-center">
            <div className="flex max-w-sm items-end gap-2">
              <img src={MENTOR_IMG} alt="" draggable={false} className="h-16 w-auto shrink-0" />
              <MentorBubble name={t("onboarding.mentorName")} text={tw.shown} done />
            </div>
          </div>
        </div>
      )}

      {/* ── 場景 4：捉到喇（即時獎勵感） ── */}
      {scene === "caught" && (
        <div className="relative flex flex-1 flex-col items-center justify-center px-6">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.2, 0.4].map((d) => (
              <div
                key={d}
                className="burst-ring absolute h-64 w-64 rounded-full border-4 border-gold-light"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>
          <h1
            data-testid="onb-caught"
            className="onb-pop text-4xl font-black text-gold-light drop-shadow-[0_0_20px_rgba(232,200,96,0.7)]"
          >
            {t("onboarding.caughtTitle")}
          </h1>
          <img
            src={TARGET_IMG}
            alt=""
            draggable={false}
            className="onb-pop float-bob mt-4 h-44 w-auto drop-shadow-[0_12px_18px_rgba(0,0,0,0.6)]"
          />
          <div className="mt-5 flex w-full justify-center">
            <div className="flex max-w-sm items-end gap-2">
              <img src={MENTOR_IMG} alt="" draggable={false} className="h-16 w-auto shrink-0" />
              <MentorBubble name={t("onboarding.mentorName")} text={tw.shown} done />
            </div>
          </div>
          <button
            data-testid="onb-caught-next"
            onClick={() => setScene("world")}
            className="btn-gold mt-6 px-10 py-3.5 text-lg font-black"
          >
            {t("common.next")}
          </button>
        </div>
      )}

      {/* ── 場景 5：去邊搵精靈＋出發 ── */}
      {scene === "world" && (
        <div className="flex flex-1 flex-col items-center px-7 pt-3">
          <h1 className="game-title-sm text-center text-[24px] font-black text-ink">
            {t("onboarding.worldTitle")}
          </h1>
          <div className="mt-2">
            <Flourish />
          </div>

          <div className="mt-4 flex w-full max-w-sm flex-col gap-3">
            <div className="onb-pop flex items-center gap-3 rounded-2xl border-2 border-gold/60 bg-white/60 p-3 shadow-sm">
              <img
                src="/images/onboarding/onboard-walk.webp"
                alt=""
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
              <div>
                <p className="text-sm font-black text-ink">{t("onboarding.step1Title")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                  {t("onboarding.step2Body")}
                </p>
              </div>
            </div>
            <div
              className="onb-pop flex items-center gap-3 rounded-2xl border-2 border-gold/60 bg-white/60 p-3 shadow-sm"
              style={{ animationDelay: "0.12s" }}
            >
              <img
                src="/images/onboarding/onboard-evolve.webp"
                alt=""
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
              <div>
                <p className="text-sm font-black text-ink">{t("onboarding.step4Title")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                  {t("onboarding.step4Body")}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex w-full justify-center">
            <div className="flex max-w-sm items-end gap-2">
              <img src={MENTOR_IMG} alt="" draggable={false} className="h-16 w-auto shrink-0" />
              <MentorBubble name={t("onboarding.mentorName")} text={tw.shown} done />
            </div>
          </div>

          <button
            data-testid="onb-start"
            onClick={finish}
            className="btn-gold mt-auto mb-8 w-full max-w-sm px-6 py-4 text-lg font-black"
          >
            {t("onboarding.startHunt")}
          </button>
        </div>
      )}

      {/* Skip（最尾一幕唔使，出發掣就係出口） */}
      {scene !== "world" && (
        <div
          className="flex justify-start px-6"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <button
            data-testid="onb-skip"
            onClick={finish}
            className={`px-4 py-2 text-sm font-bold ${dark ? "text-white/60" : "text-ink-soft"}`}
          >
            {t("common.skip")}
          </button>
        </div>
      )}
    </main>
  );
}
