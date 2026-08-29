"use client";

import type { ElementType } from "@/content/types";
import { duckMusic, setMusicMuted } from "./music";

/**
 * 程序化戰鬥音效引擎（Web Audio 合成，零音頻檔案）。
 * AudioContext 喺首次用戶手勢先建立（autoplay 政策）；
 * 全部音效由 oscillator＋noise＋envelope＋filter 即場合成。
 */

const MUTE_KEY = "hh-sfx-muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

if (typeof window !== "undefined") {
  muted = localStorage.getItem(MUTE_KEY) === "1";
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* private mode 等情況忽略 */
  }
  // 音效／音樂兩個 key 必須一齊——舊版可能淨靜音咗一邊，UI 顯示關聲但仍有 BGM
  setMusicMuted(m);
  // 靜音即停 Web Audio（進行中嘅 oscillator 都一齊熄）
  if (m) {
    if (ctx?.state === "running") void ctx.suspend();
  } else if (ctx?.state === "suspended") {
    void ctx.resume();
  }
}

/** 喺用戶手勢入面 call：建立/恢復 AudioContext */
function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    // 共用白噪 buffer（1 秒）
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  // 靜音中唔好 resume——唔然 setMuted 嘅 suspend 會即刻被下一聲 sfx* 解鎖
  if (ctx.state === "suspended" && !muted) void ctx.resume();
  return ctx;
}

/** 手機震動（唔支持就靜默跳過） */
export function buzz(pattern: number | number[]) {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 桌面瀏覽器冇 vibrate */
  }
}

// ── 合成原語 ────────────────────────────────────

interface ToneOpts {
  freq: number;
  /** 結尾滑到嘅頻率 */
  glide?: number;
  type?: OscillatorType;
  dur: number;
  /** 峰值音量 0–1 */
  vol?: number;
  delay?: number;
  attack?: number;
}

function tone(o: ToneOpts) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide), t0 + o.dur);
  const g = c.createGain();
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + o.dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  delay?: number;
  /** 濾波器 */
  filter?: BiquadFilterType;
  freq?: number;
  /** 濾波截止頻率滑向 */
  freqGlide?: number;
  attack?: number;
}

function noise(o: NoiseOpts) {
  const c = ensureCtx();
  if (!c || !master || !noiseBuf || muted) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? "lowpass";
  f.frequency.setValueAtTime(o.freq ?? 1000, t0);
  if (o.freqGlide) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqGlide), t0 + o.dur);
  const g = c.createGain();
  const atk = o.attack ?? 0.008;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.25, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + o.dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

// ── 戰鬥音效 ────────────────────────────────────

/** 出招聲：五行各有音色 */
export function sfxCast(element: ElementType) {
  switch (element) {
    case "fire":
      // 火焰 whoosh：低通噪音掃頻上升
      noise({ dur: 0.38, vol: 0.3, filter: "lowpass", freq: 400, freqGlide: 3200, attack: 0.05 });
      tone({ freq: 90, glide: 200, type: "sawtooth", dur: 0.3, vol: 0.1 });
      break;
    case "water":
      // 氣泡串：三粒短 sine 上滑
      for (let i = 0; i < 3; i++)
        tone({ freq: 350 + i * 180, glide: 900 + i * 250, dur: 0.1, vol: 0.16, delay: i * 0.07 });
      noise({ dur: 0.3, vol: 0.08, filter: "bandpass", freq: 2200, attack: 0.03 });
      break;
    case "metal":
      // 金屬 ping：高頻雙音快衰減
      tone({ freq: 1760, dur: 0.22, vol: 0.14, type: "triangle" });
      tone({ freq: 2637, dur: 0.16, vol: 0.09, type: "sine", delay: 0.015 });
      noise({ dur: 0.1, vol: 0.1, filter: "highpass", freq: 5000 });
      break;
    case "earth":
      // 沉實 thud＋碎石
      tone({ freq: 120, glide: 50, type: "sine", dur: 0.28, vol: 0.32 });
      noise({ dur: 0.18, vol: 0.14, filter: "lowpass", freq: 900, freqGlide: 200 });
      break;
    case "wood":
      // 風聲 swish：帶通噪音掃頻
      noise({ dur: 0.32, vol: 0.24, filter: "bandpass", freq: 800, freqGlide: 2800, attack: 0.06 });
      break;
  }
}

/** 大招蓄力：低頻隆隆上升＋聚氣閃粉，營造「有嘢嚟緊」嘅壓迫感 */
export function sfxCharge() {
  duckMusic(1000);
  // 低頻上升隆隆聲
  tone({ freq: 60, glide: 220, type: "sawtooth", dur: 0.8, vol: 0.22, attack: 0.15 });
  noise({ dur: 0.8, vol: 0.14, filter: "lowpass", freq: 300, freqGlide: 2400, attack: 0.2 });
  // 聚氣風鈴：三粒上行閃音
  [880, 1174.7, 1568].forEach((f, i) =>
    tone({ freq: f, dur: 0.16, vol: 0.09, delay: 0.25 + i * 0.16, attack: 0.01 })
  );
  buzz([30, 40, 30, 40, 80]);
}

/** 大招命中：厚重爆炸＋餘震，明顯大過普通命中 */
export function sfxUltHit(crit = false) {
  duckMusic(700);
  noise({ dur: 0.35, vol: 0.5, filter: "lowpass", freq: 3000, freqGlide: 200 });
  tone({ freq: 90, glide: 35, type: "square", dur: 0.4, vol: 0.34 });
  tone({ freq: 2400, glide: 500, type: "sawtooth", dur: 0.12, vol: 0.12 });
  // 餘震
  noise({ dur: 0.25, vol: 0.2, filter: "lowpass", freq: 900, freqGlide: 150, delay: 0.18 });
  buzz(crit ? [80, 40, 100, 40, 60] : [80, 50, 90]);
}

/** 敵方出招預警：短促滴滴警示（大招用低沉雙響，更有壓迫感） */
export function sfxWarn(ult = false) {
  if (ult) {
    duckMusic(600);
    tone({ freq: 220, glide: 180, type: "sawtooth", dur: 0.22, vol: 0.2 });
    tone({ freq: 220, glide: 180, type: "sawtooth", dur: 0.28, vol: 0.24, delay: 0.26 });
    noise({ dur: 0.3, vol: 0.1, filter: "lowpass", freq: 500, freqGlide: 200, delay: 0.2 });
    buzz([60, 60, 90]);
  } else {
    tone({ freq: 1180, dur: 0.09, vol: 0.16, type: "square" });
    tone({ freq: 1180, dur: 0.09, vol: 0.16, type: "square", delay: 0.13 });
    buzz(25);
  }
}

/** 閃避側撲：快速 whoosh */
export function sfxDodge() {
  noise({ dur: 0.18, vol: 0.26, filter: "bandpass", freq: 900, freqGlide: 3200, attack: 0.01 });
  tone({ freq: 480, glide: 900, dur: 0.1, vol: 0.1, type: "sine" });
  buzz(18);
}

/** 能量儲滿：上行雙音提示 */
export function sfxEnergyFull() {
  duckMusic(400);
  tone({ freq: 784, dur: 0.14, vol: 0.16, type: "triangle" });
  tone({ freq: 1174.7, dur: 0.3, vol: 0.18, type: "triangle", delay: 0.11, attack: 0.01 });
  noise({ dur: 0.25, vol: 0.06, filter: "highpass", freq: 5000, delay: 0.1 });
  buzz([20, 20, 40]);
}

/** 命中悶響 */
export function sfxHit() {
  noise({ dur: 0.14, vol: 0.32, filter: "lowpass", freq: 1400, freqGlide: 300 });
  tone({ freq: 150, glide: 60, type: "square", dur: 0.12, vol: 0.2 });
  buzz(30);
}

/** 暴擊爆響 */
export function sfxCrit() {
  noise({ dur: 0.2, vol: 0.4, filter: "lowpass", freq: 2400, freqGlide: 300 });
  tone({ freq: 200, glide: 55, type: "square", dur: 0.18, vol: 0.26 });
  tone({ freq: 3200, glide: 1200, type: "sawtooth", dur: 0.08, vol: 0.1 });
  buzz([40, 30, 60]);
}

/** 治療上行琶音 */
export function sfxHeal() {
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((f, i) => tone({ freq: f, dur: 0.28, vol: 0.14, delay: i * 0.09, attack: 0.02 }));
}

/** KO 下墜滑音 */
export function sfxKo() {
  tone({ freq: 500, glide: 60, type: "sawtooth", dur: 0.55, vol: 0.2 });
  noise({ dur: 0.4, vol: 0.15, filter: "lowpass", freq: 800, freqGlide: 100, delay: 0.1 });
  buzz([60, 40, 120]);
}

/** 勝利號角：大三和弦琶音＋結尾長音 */
export function sfxVictory() {
  duckMusic(900);
  const seq = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  seq.forEach((f, i) =>
    tone({ freq: f, dur: i === seq.length - 1 ? 0.6 : 0.18, vol: 0.16, delay: i * 0.14, type: "triangle", attack: 0.015 })
  );
  buzz([50, 50, 50, 50, 120]);
}

/** 落敗下行三連音 */
export function sfxDefeat() {
  const seq = [392, 311.13, 261.63]; // G4 Eb4 C4（小調感）
  seq.forEach((f, i) => tone({ freq: f, dur: 0.4, vol: 0.15, delay: i * 0.22, type: "triangle", attack: 0.02 }));
}

/** UI 按鈕 pop：圓潤泡泡聲（低頻起跳上滑＋高頻閃光層＋氣泡 click），
 *  出聲一刻音樂自動讓路（ducking）先唔會被背景音樂蓋過。
 *  全局按鈕回饋都行呢度，90ms 防抖避免全局監聽同頁面手動 call 疊聲 */
let lastTapAt = 0;
export function sfxTap() {
  if (muted) return;
  const now = Date.now();
  if (now - lastTapAt < 90) return;
  lastTapAt = now;
  duckMusic(130);
  // 主體：飽滿嘅 pop（低→高快速上滑，圓潤有肉；triangle 帶泛音，唔會被 mix 埋沒）
  tone({ freq: 560, glide: 1180, dur: 0.12, vol: 0.5, type: "triangle", attack: 0.003 });
  // 高頻閃光層：令個 pop 聽落「明亮」，喺音樂之上突圍
  tone({ freq: 1800, glide: 2800, dur: 0.07, vol: 0.22, type: "sine", delay: 0.012 });
  // 氣泡破裂 click transient
  noise({ dur: 0.03, vol: 0.16, filter: "highpass", freq: 3500 });
  buzz(14);
}

// ── 捕捉音效 ────────────────────────────────────

/** 精靈登場：閃粉風鈴 */
export function sfxAppear() {
  const notes = [1046.5, 1318.5, 1568, 2093]; // C6 E6 G6 C7
  notes.forEach((f, i) => tone({ freq: f, dur: 0.22, vol: 0.08, delay: i * 0.06, attack: 0.01 }));
  noise({ dur: 0.35, vol: 0.05, filter: "highpass", freq: 6000, attack: 0.05 });
}

/** 筷子飛夾：swish＋合埋嘅脆響 */
export function sfxSnap() {
  noise({ dur: 0.12, vol: 0.22, filter: "bandpass", freq: 1200, freqGlide: 3500, attack: 0.01 });
  tone({ freq: 1800, glide: 900, dur: 0.06, vol: 0.16, type: "square", delay: 0.09 });
  buzz(20);
}

/** 衝屏撞擊（最後關頭效果 A）：低頻悶撼「咚」＋撞面衝擊噪爆＋玻璃碎裂脆層，賣「撞爆屏」感 */
export function sfxBump() {
  duckMusic(600);
  // 低頻悶撼
  tone({ freq: 150, glide: 45, type: "sine", dur: 0.34, vol: 0.42 });
  tone({ freq: 90, glide: 40, type: "square", dur: 0.3, vol: 0.2, delay: 0.01 });
  // 撞面衝擊噪爆
  noise({ dur: 0.28, vol: 0.4, filter: "lowpass", freq: 3000, freqGlide: 220 });
  // 玻璃碎裂脆層
  noise({ dur: 0.18, vol: 0.24, filter: "highpass", freq: 5200, attack: 0.002, delay: 0.02 });
  tone({ freq: 2600, glide: 900, type: "sawtooth", dur: 0.08, vol: 0.1, delay: 0.02 });
  buzz([0, 55, 30, 80]);
}

/** 夾中評級：愈高音愈高 */
export function sfxGrade(grade: "perfect" | "great" | "good") {
  const base = grade === "perfect" ? 880 : grade === "great" ? 700 : 560;
  tone({ freq: base, dur: 0.1, vol: 0.14, type: "triangle" });
  tone({ freq: base * 1.5, dur: 0.16, vol: 0.12, type: "triangle", delay: 0.08 });
  if (grade === "perfect") {
    tone({ freq: base * 2, dur: 0.22, vol: 0.1, type: "triangle", delay: 0.16 });
    buzz([25, 20, 40]);
  } else buzz(25);
}

/** 夾空 womp */
export function sfxMiss() {
  tone({ freq: 300, glide: 140, type: "sawtooth", dur: 0.28, vol: 0.14 });
  buzz(50);
}

/** 搏鬥狂撳 tick：progress 0–1，愈接近捕獲音愈高（俾進度聽覺回饋） */
export function sfxStruggleTick(progress: number) {
  tone({ freq: 420 + progress * 500, dur: 0.05, vol: 0.1, type: "square" });
  buzz(12);
}

/** 搏鬥狂暴爆發：低吼＋噪音爆 */
export function sfxFrenzy() {
  tone({ freq: 160, glide: 60, type: "sawtooth", dur: 0.5, vol: 0.22 });
  tone({ freq: 90, glide: 45, type: "square", dur: 0.5, vol: 0.14, delay: 0.04 });
  noise({ dur: 0.35, vol: 0.2, filter: "bandpass", freq: 600, freqGlide: 1800 });
  buzz([70, 40, 90]);
}

/** 閃光精靈登場：高音風鈴璀璨版 */
export function sfxShiny() {
  const notes = [1318.5, 1568, 2093, 2637, 3136]; // E6 G6 C7 E7 G7
  notes.forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.09, delay: 0.1 + i * 0.07, attack: 0.01 }));
  noise({ dur: 0.7, vol: 0.06, filter: "highpass", freq: 7000, attack: 0.15, delay: 0.1 });
  buzz([30, 30, 30, 30, 60]);
}

/** 摸頭：短促上滑啾啾（精靈開心） */
export function sfxPet() {
  tone({ freq: 900, glide: 1500, dur: 0.09, vol: 0.16, type: "sine" });
  tone({ freq: 1200, glide: 1900, dur: 0.12, vol: 0.13, type: "sine", delay: 0.1 });
  buzz(15);
}

/** 掟小食：拋物 whoosh */
export function sfxThrow() {
  noise({ dur: 0.28, vol: 0.16, filter: "bandpass", freq: 700, freqGlide: 2400, attack: 0.02 });
  tone({ freq: 380, glide: 760, dur: 0.2, vol: 0.08, type: "sine" });
}

/** 食嘢：兩下咀嚼＋滿足尾音 */
export function sfxEat() {
  noise({ dur: 0.06, vol: 0.2, filter: "lowpass", freq: 1800, freqGlide: 500 });
  noise({ dur: 0.06, vol: 0.18, filter: "lowpass", freq: 1600, freqGlide: 450, delay: 0.16 });
  tone({ freq: 620, glide: 880, dur: 0.22, vol: 0.1, type: "triangle", delay: 0.34 });
  buzz([15, 40, 15]);
}

/** 精靈掙甩逃走 */
export function sfxEscape() {
  tone({ freq: 700, glide: 180, type: "sawtooth", dur: 0.45, vol: 0.16 });
  noise({ dur: 0.3, vol: 0.12, filter: "bandpass", freq: 2000, freqGlide: 500, delay: 0.05 });
  buzz([40, 60, 80]);
}

/** 捕捉成功大合奏：號角琶音＋閃粉 */
export function sfxCapture() {
  duckMusic(1000);
  const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
  seq.forEach((f, i) =>
    tone({ freq: f, dur: i >= seq.length - 2 ? 0.55 : 0.16, vol: 0.15, delay: i * 0.12, type: "triangle", attack: 0.012 })
  );
  noise({ dur: 0.8, vol: 0.05, filter: "highpass", freq: 5500, attack: 0.2, delay: 0.35 });
  buzz([60, 40, 60, 40, 150]);
}

// ── 其他頁面 ────────────────────────────────────

/** 打卡成功／獲得獎勵：兩音符＋閃鈴 */
export function sfxReward() {
  duckMusic(500);
  tone({ freq: 659.25, dur: 0.14, vol: 0.14, type: "triangle" });
  tone({ freq: 987.77, dur: 0.32, vol: 0.14, type: "triangle", delay: 0.11 });
  tone({ freq: 1975.5, dur: 0.25, vol: 0.06, delay: 0.2 });
  buzz([40, 30, 80]);
}

/** 進化大號角：上行琶音＋顫音長尾 */
export function sfxEvolve() {
  duckMusic(1300);
  const seq = [392, 523.25, 659.25, 783.99, 1046.5]; // G4 C5 E5 G5 C6
  seq.forEach((f, i) =>
    tone({ freq: f, dur: i === seq.length - 1 ? 0.9 : 0.2, vol: 0.16, delay: i * 0.16, type: "triangle", attack: 0.015 })
  );
  // 閃爍高音裝飾
  [1568, 2093, 1568].forEach((f, i) => tone({ freq: f, dur: 0.14, vol: 0.06, delay: 0.85 + i * 0.09 }));
  noise({ dur: 1.0, vol: 0.04, filter: "highpass", freq: 6000, attack: 0.3, delay: 0.5 });
  buzz([80, 50, 80, 50, 200]);
}
