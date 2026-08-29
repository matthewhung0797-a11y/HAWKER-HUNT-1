"use client";

/**
 * 背景音樂播放管理器（HTMLAudio，AI 生成 mp3 喺 public/music/）。
 * - 單一 current track，切換時交叉淡入淡出
 * - loop 循環、音量恆定、靜音獨立記憶（hh-music-muted）
 * - autoplay 政策：play() 被拒就等下一次用戶手勢再試
 */

const MUTE_KEY = "hh-music-muted";
const BASE_VOLUME = 0.32;
const FADE_MS = 1200;

let current: HTMLAudioElement | null = null;
let currentId: string | null = null;
let muted = false;
let gestureHooked = false;
/** 音樂閃避 timer——要喺 silenceAll 之前宣告 */
let duckTimer: number | null = null;

/** 所有已建立、未熄嘅 audio 元素——保證任何時候最多得一條 track 出聲 */
const live = new Set<HTMLAudioElement>();
/** 每 track 一個進行中嘅 fade timer，避免互相打架 */
const fadeTimers = new WeakMap<HTMLAudioElement, number>();

if (typeof window !== "undefined") {
  muted = localStorage.getItem(MUTE_KEY) === "1";

  // 用戶滑走 Safari／切 app：即刻停晒所有 track（遊戲背景音樂唔應該喺後台繼續響）；
  // 返嚟先繼續播（尊重靜音設定）。pagehide 係 iOS 收埋 tab 嘅保險。
  const pauseAll = () => {
    for (const audio of live) audio.pause();
  };
  const resumeCurrent = () => {
    if (current && !muted && live.has(current)) {
      current.muted = false;
      void current.play().catch(() => hookGesture());
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pauseAll();
    else resumeCurrent();
  });
  window.addEventListener("pagehide", pauseAll);
}

export function isMusicMuted() {
  return muted;
}

/** 即時停晒所有 live track（清 fade／duck），唔靠淡出 onDone——避免同 duck 打架熄唔到 */
function silenceAll() {
  if (duckTimer !== null) {
    window.clearTimeout(duckTimer);
    duckTimer = null;
  }
  for (const audio of live) {
    const t = fadeTimers.get(audio);
    if (t !== undefined) window.clearInterval(t);
    fadeTimers.delete(audio);
    audio.volume = 0;
    audio.muted = true;
    audio.pause();
  }
}

export function setMusicMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* private mode 忽略 */
  }
  if (m) {
    silenceAll();
    return;
  }
  if (current && live.has(current)) {
    current.muted = false;
    void current.play().catch(() => hookGesture());
    fadeTo(current, BASE_VOLUME, 400);
  }
}

function fadeTo(audio: HTMLAudioElement, target: number, ms: number, onDone?: () => void) {
  const prev = fadeTimers.get(audio);
  if (prev !== undefined) window.clearInterval(prev);
  const from = audio.volume;
  const t0 = performance.now();
  const timer = window.setInterval(() => {
    // 靜音中唔好再推音量（走漏嘅 fade 要即死）
    if (muted && target > 0) {
      window.clearInterval(timer);
      fadeTimers.delete(audio);
      audio.volume = 0;
      audio.muted = true;
      audio.pause();
      return;
    }
    const k = Math.min(1, (performance.now() - t0) / ms);
    audio.volume = from + (target - from) * k;
    if (k >= 1) {
      window.clearInterval(timer);
      fadeTimers.delete(audio);
      onDone?.();
    }
  }, 50);
  fadeTimers.set(audio, timer);
}

/** 即時熄咗佢：清 fade timer、pause、釋放 src */
function kill(audio: HTMLAudioElement) {
  const t = fadeTimers.get(audio);
  if (t !== undefined) window.clearInterval(t);
  fadeTimers.delete(audio);
  audio.pause();
  audio.src = "";
  live.delete(audio);
}

/**
 * 淡出後熄機。另加硬性 setTimeout 保險——就算 fade timer 中途俾其他 fade
 * 蓋走（onDone 永遠唔會行），track 都一定會喺 ms+200 內熄，唔會變鬼音重疊。
 */
function retire(audio: HTMLAudioElement, ms: number) {
  fadeTo(audio, 0, ms, () => kill(audio));
  window.setTimeout(() => {
    if (live.has(audio)) kill(audio);
  }, ms + 200);
}

/** autoplay 被拒：掛一次性手勢監聽，用戶一掂屏幕就開波 */
function hookGesture() {
  if (gestureHooked || typeof window === "undefined") return;
  gestureHooked = true;
  const retry = () => {
    gestureHooked = false;
    window.removeEventListener("pointerdown", retry);
    window.removeEventListener("keydown", retry);
    if (current && !muted) {
      current.muted = false;
      void current.play().catch(() => hookGesture());
    }
  };
  window.addEventListener("pointerdown", retry, { once: true });
  window.addEventListener("keydown", retry, { once: true });
}

/**
 * 播放指定 track（public/music/<id>.mp3）。
 * 同一 track 重複 call 唔會重新開始；唔同 track 就交叉淡入淡出。
 * 靜音中：淨係換好 track、唔 play（開聲時 setMusicMuted(false) 會接返）。
 */
export function playMusic(id: string) {
  if (typeof window === "undefined") return;
  // 同一 track：靜音就確保停住；開聲先至 resume
  if (currentId === id && current && live.has(current)) {
    if (muted) {
      current.volume = 0;
      current.muted = true;
      current.pause();
      return;
    }
    if (current.paused) {
      current.muted = false;
      void current.play().catch(() => hookGesture());
      fadeTo(current, BASE_VOLUME, 400);
    }
    return;
  }

  const audio = new Audio(`/music/${id}.mp3`);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  audio.muted = muted;
  live.add(audio);

  // 除咗新嗰條，其他全部淡出熄機（包括任何走漏嘅舊 track）
  for (const other of live) {
    if (other !== audio) retire(other, FADE_MS);
  }

  current = audio;
  currentId = id;

  // 靜音：唔好 play()——唔然會有條「音量 0 但仍在播」嘅 track，之後任何 fade 一推就出聲
  if (muted) {
    audio.pause();
    return;
  }

  void audio.play().catch(() => hookGesture());
  fadeTo(audio, BASE_VOLUME, FADE_MS);
}

/** 音樂閃避（ducking）：UI 音效出聲一刻音樂讓路縮低，即刻聽得清音效 */
export function duckMusic(holdMs = 130) {
  if (!current || muted) return;
  const audio = current;
  if (duckTimer !== null) window.clearTimeout(duckTimer);
  // 即時跌落 40%（唔用 fade，要即時讓路）
  const prev = fadeTimers.get(audio);
  if (prev !== undefined) window.clearInterval(prev);
  audio.volume = BASE_VOLUME * 0.4;
  duckTimer = window.setTimeout(() => {
    duckTimer = null;
    // 期間如果用戶已經靜音，唔好推返音量上去（否則同 setMusicMuted 打交，變成撳極都熄唔到）
    if (muted) return;
    fadeTo(audio, BASE_VOLUME, 260);
  }, holdMs);
}

/** 淡出並停止（清埋所有走漏嘅 track） */
export function stopMusic() {
  current = null;
  currentId = null;
  for (const audio of live) retire(audio, 600);
}
