"use client";

/**
 * 背景音樂播放管理器（HTMLAudio，AI 生成 mp3 喺 public/music/）。
 * - 單一 current track，切換時交叉淡入淡出
 * - loop 循環、音量恆定、靜音獨立記憶（hh-music-muted）
 * - autoplay 政策：play() 被拒就等下一次用戶手勢再試
 */

const MUTE_KEY = "hh-music-muted";
const TRACK_KEY = "hh-music-track";
const MODE_KEY = "hh-music-mode";
const BASE_VOLUME = 0.32;
const FADE_MS = 1200;

/** 播放模式：repeat = 單曲循環；next = 播完自動下一首（循環整個列表） */
export type MusicMode = "repeat" | "next";

/** 可選曲目（id = public/music/<id>.mp3；名稱行 i18n music.<id>） */
export const MUSIC_TRACKS = [
  { id: "bgm-main", key: "main" },
  { id: "bgm-morning-light", key: "morningLight" },
  { id: "bgm-sugarcane", key: "sugarcane" },
  { id: "bgm-flavors", key: "flavors" },
  { id: "bgm-hunter-go", key: "hunterGo" },
  { id: "bgm-cold-soup", key: "coldSoup" },
  { id: "bgm-chicken-rice", key: "chickenRice" },
] as const;

let current: HTMLAudioElement | null = null;
let currentId: string | null = null;
let muted = false;
let gestureHooked = false;
/** 音樂閃避 timer——要喺 silenceAll 之前宣告 */
let duckTimer: number | null = null;
/** 播放進度訂閱（0-1；MusicPlayer 圓環讀條用） */
let progressCb: ((p: number) => void) | null = null;
/** 目前曲目訂閱（切歌時通知 UI 標示正在播邊首） */
let trackCb: ((id: string | null) => void) | null = null;
/** 播放模式（repeat=重複單曲 / next=播完下一首） */
let musicMode: MusicMode = "repeat";
/** 模式變更訂閱（MusicPlayer 列表勾選用） */
let modeCb: ((m: MusicMode) => void) | null = null;
/** 播放/暫停狀態訂閱（MusicPlayer 停止/繼續掣用） */
let pauseCb: ((paused: boolean) => void) | null = null;

/** 所有已建立、未熄嘅 audio 元素——保證任何時候最多得一條 track 出聲 */
const live = new Set<HTMLAudioElement>();
/** 每 track 一個進行中嘅 fade timer，避免互相打架 */
const fadeTimers = new WeakMap<HTMLAudioElement, number>();

if (typeof window !== "undefined") {
  muted = localStorage.getItem(MUTE_KEY) === "1";
  musicMode = localStorage.getItem(MODE_KEY) === "next" ? "next" : "repeat";

  // 背景播放：最小化／切 tab／熄屏唔停（用戶要求一直播，唔好自己剎停）。
  // iOS 系統層面仍會暫停背景音效——返返前台 resumeCurrent 接返（尊重靜音設定）。
  const resumeCurrent = () => {
    if (current && !muted && live.has(current)) {
      current.muted = false;
      void current.play().catch(() => hookGesture());
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeCurrent();
  });

  // OS 媒體控制（鎖屏／通知欄／媒體鍵）：顯示歌名＋play/pause/上下首
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", () => {
        resumeCurrent();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        current?.pause();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        playNextTrack();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        playPrevTrack();
      });
    } catch {
      /* ignore */
    }
  }
}

/** MediaSession 歌名（OS 鎖屏／通知欄顯示；zh/en 跟系統語言） */
const TRACK_NAMES: Record<string, { zh: string; en: string }> = {
  "bgm-main": { zh: "原版配樂", en: "Original Theme" },
  "bgm-morning-light": { zh: "晨光正好", en: "Morning Light" },
  "bgm-sugarcane": { zh: "那杯甘蔗水", en: "Sugarcane Juice" },
  "bgm-flavors": { zh: "八方來味", en: "Flavors Everywhere" },
  "bgm-hunter-go": { zh: "獵人出發", en: "Hunter Sets Off" },
  "bgm-cold-soup": { zh: "涼了的湯", en: "The Cold Soup" },
  "bgm-chicken-rice": { zh: "那碗雞飯", en: "That Chicken Rice Bowl" },
};

/** 更新 OS 媒體控制（鎖屏／通知欄）顯示 */
function updateMediaSession(id: string | null) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    const ms = navigator.mediaSession;
    if (!id) {
      ms.metadata = null;
      return;
    }
    const names = TRACK_NAMES[id];
    const isZh = (navigator.language || "").toLowerCase().startsWith("zh");
    ms.metadata = new MediaMetadata({
      title: names ? (isZh ? names.zh : names.en) : id,
      artist: "Hawker Hunt",
      album: isZh ? "背景音樂" : "Background Music",
    });
  } catch {
    /* 舊瀏覽器唔支援，忽略 */
  }
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

/** 後台上傳嘅動態曲目（id → mp3 URL；MusicPlayer 拉清單後 registerDynamicTracks 註冊） */
const dynamicUrls = new Map<string, string>();

/** 註冊後台上傳曲目嘅 mp3 URL（player 端拉清單後呼叫；重複註冊冇副作用） */
export function registerDynamicTracks(tracks: { id: string; url: string }[]): void {
  for (const t of tracks) dynamicUrls.set(t.id, t.url);
}

/** track id → mp3 URL：內建曲目 = /music/<id>.mp3；後台上傳 = Storage URL */
export function trackUrl(id: string): string {
  return dynamicUrls.get(id) ?? `/music/${id}.mp3`;
}

/** 全部可用曲目 id（內建 + 後台上傳），next 模式循環用 */
export function allTrackIds(): string[] {
  return [...MUSIC_TRACKS.map((t) => t.id), ...dynamicUrls.keys()];
}

/**
 * 播放指定 track（內建 = public/music/<id>.mp3；後台上傳 = Storage URL）。
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

  const audio = new Audio(trackUrl(id));
  audio.loop = musicMode === "repeat";
  audio.preload = "auto";
  audio.volume = 0;
  audio.muted = muted;
  live.add(audio);
  // 進度回報：只有 current track 先至回報（MusicPlayer 圓環讀條用）
  audio.addEventListener("timeupdate", () => {
    if (audio === current && audio.duration > 0) progressCb?.(audio.currentTime / audio.duration);
  });
  // next 模式：播完自動跳下一首（循環整個列表）；repeat 模式 loop=true 唔會 end
  audio.addEventListener("ended", () => {
    if (audio === current && musicMode === "next") playNextTrack();
  });
  // 播/停狀態回報：任何來源（玩家掣／OS 媒體鍵／visibility）都同步
  audio.addEventListener("play", () => {
    if (audio === current) pauseCb?.(false);
  });
  audio.addEventListener("pause", () => {
    if (audio === current) pauseCb?.(true);
  });

  // 除咗新嗰條，其他全部淡出熄機（包括任何走漏嘅舊 track）
  for (const other of live) {
    if (other !== audio) retire(other, FADE_MS);
  }

  current = audio;
  currentId = id;
  trackCb?.(currentId);
  progressCb?.(0);
  updateMediaSession(id);

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

/** 用戶揀咗邊條 track（null = 冇揀過，跟頁面預設） */
export function getPreferredMusicId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TRACK_KEY);
  } catch {
    return null;
  }
}

/** 頁面預設音樂：玩家揀過歌就播佢揀嗰條，冇先播頁面預設 */
export function playDefaultMusic(id: string) {
  playMusic(getPreferredMusicId() ?? id);
}

/** 玩家揀歌：記落 localStorage＋即刻播（跨頁面都會繼續播玩家揀嘅歌） */
export function selectMusic(id: string) {
  try {
    localStorage.setItem(TRACK_KEY, id);
  } catch {
    /* private mode 忽略 */
  }
  playMusic(id);
}

/** 玩家揀返「原版／跟頁面預設」：清偏好＋播返頁面預設 track */
export function clearMusicPreference(defaultId: string) {
  try {
    localStorage.removeItem(TRACK_KEY);
  } catch {
    /* ignore */
  }
  playMusic(defaultId);
}

/** 訂閱播放進度（0-1，循環）。回傳解除函數 */
export function onMusicProgress(cb: (p: number) => void): () => void {
  progressCb = cb;
  return () => {
    if (progressCb === cb) progressCb = null;
  };
}

/** 訂閱曲目切換（id 或 null）。回傳解除函數 */
export function onMusicTrackChange(cb: (id: string | null) => void): () => void {
  trackCb = cb;
  return () => {
    if (trackCb === cb) trackCb = null;
  };
}

/** 目前播放中嘅 track id（null = 冇播） */
export function getCurrentMusicId(): string | null {
  return currentId;
}

/** 目前播放模式（repeat = 重複單曲 / next = 播完下一首） */
export function getMusicMode(): MusicMode {
  return musicMode;
}

/** 玩家切換播放模式：記 localStorage＋即時套用喺緊播緊嘅 track（唔重新開始） */
export function setMusicMode(m: MusicMode) {
  musicMode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* private mode 忽略 */
  }
  // 即時套用：repeat = 開返 loop；next = 閂 loop（播完自然 ended → 跳下一首）
  if (current && live.has(current)) current.loop = m === "repeat";
  modeCb?.(m);
}

/** 訂閱播放模式變更。回傳解除函數 */
export function onMusicModeChange(cb: (m: MusicMode) => void): () => void {
  modeCb = cb;
  return () => {
    if (modeCb === cb) modeCb = null;
  };
}

/** 播下一首（列表順序循環；ended 自動跳都用呢個） */
export function playNextTrack() {
  if (!currentId) return;
  const idx = MUSIC_TRACKS.findIndex((tr) => tr.id === currentId);
  if (idx < 0) return;
  const next = MUSIC_TRACKS[(idx + 1) % MUSIC_TRACKS.length];
  playMusic(next.id);
}

/** 播上一首（列表順序循環；OS 媒體鍵 previoustrack 用） */
export function playPrevTrack() {
  if (!currentId) return;
  const idx = MUSIC_TRACKS.findIndex((tr) => tr.id === currentId);
  if (idx < 0) return;
  const prev = MUSIC_TRACKS[(idx - 1 + MUSIC_TRACKS.length) % MUSIC_TRACKS.length];
  playMusic(prev.id);
}

/** 而家係咪暫停緊（冇播 = 當暫停） */
export function isMusicPaused(): boolean {
  return !current || current.paused;
}

/** 停止播放（暫停喺現時位置；繼續播放由呢度接返） */
export function pauseMusic() {
  if (!current) return;
  current.pause();
  pauseCb?.(true);
}

/** 繼續播放（由暫停位接返；autoplay 被拒等手勢） */
export function resumeMusic() {
  if (!current || muted) return;
  current.muted = false;
  void current.play().catch(() => hookGesture());
  fadeTo(current, BASE_VOLUME, 400);
  pauseCb?.(false);
}

/** 訂閱播放/暫停狀態變更。回傳解除函數 */
export function onMusicPauseChange(cb: (paused: boolean) => void): () => void {
  pauseCb = cb;
  return () => {
    if (pauseCb === cb) pauseCb = null;
  };
}
