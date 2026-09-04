"use client";

/**
 * 地圖音樂播放器：52px 圓形按鈕（金圈進度讀條）＋可選曲目小列表。
 * - 放喺地圖頁羅盤圖示下方（right-3 top-[84px]）
 * - 讀條 = 目前 track 播放進度（timeupdate 驅動）
 * - 列表含原版配樂＋6 首玩家音樂；揀選記 localStorage 跨頁面生效
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MUSIC_TRACKS, onMusicProgress, onMusicTrackChange, onMusicModeChange, onMusicPauseChange, getCurrentMusicId, selectMusic, clearMusicPreference, getMusicMode, setMusicMode, registerDynamicTracks, trackUrl, isMusicPaused, pauseMusic, resumeMusic } from "@/lib/music";
import type { MusicMode } from "@/lib/music";
import { getMusicTracks } from "@/lib/admin/actions";
import { sfxTap } from "@/lib/sfx";

/** 合併清單：內建曲目（i18n key）＋後台上傳曲目（id 前綴 bgm-） */
interface ListItem {
  id: string;
  label: string;
}

const DEFAULT_TRACK = "bgm-main";
/** 進度環半徑（按鈕 52px，內圈 r=22） */
const R = 22;
const CIRC = 2 * Math.PI * R;

export default function MusicPlayer() {
  const t = useTranslations("music");
  const locale = useLocale() as "zh" | "en";
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mode, setMode] = useState<MusicMode>("repeat");
  const [list, setList] = useState<ListItem[]>([]);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    setCurrentId(getCurrentMusicId());
    setMode(getMusicMode());
    setPaused(isMusicPaused());
    const offProgress = onMusicProgress(setProgress);
    const offTrack = onMusicTrackChange(setCurrentId);
    const offMode = onMusicModeChange(setMode);
    const offPause = onMusicPauseChange(setPaused);
    return () => {
      offProgress();
      offTrack();
      offMode();
      offPause();
    };
  }, []);

  // 曲目清單：內建 7 首＋後台上傳嘅 active 曲目（取得 URL 後註冊俾 music.ts 播）
  useEffect(() => {
    const builtIn: ListItem[] = MUSIC_TRACKS.map((tr) => ({
      id: tr.id,
      label: t(tr.key),
    }));
    let cancelled = false;
    getMusicTracks().then(
      (dbTracks) => {
        if (cancelled) return;
        registerDynamicTracks(dbTracks);
        const dbItems: ListItem[] = dbTracks.map((tr) => ({
          id: tr.id,
          label: locale === "zh" ? tr.title.zh : tr.title.en || tr.title.zh,
        }));
        setList([...builtIn, ...dbItems]);
      },
      () => {
        if (!cancelled) setList(builtIn);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function pick(id: string) {
    sfxTap();
    if (id === DEFAULT_TRACK) clearMusicPreference(DEFAULT_TRACK);
    else selectMusic(id);
  }

  return (
    <>
      {/* 播放器按鈕：羅盤圖示下方 */}
      <button
        onClick={() => {
          sfxTap();
          setOpen((o) => !o);
        }}
        className="absolute right-3 top-[84px] z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-black/55 backdrop-blur-sm active:scale-90 transition-transform"
        style={{ touchAction: "manipulation", boxShadow: "0 3px 8px rgba(0,0,0,.4)" }}
        aria-label={t("title")}
      >
        {/* 圓形進度讀條 */}
        <svg viewBox="0 0 52 52" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(248,239,217,.25)" strokeWidth="3.5" />
          <circle
            cx="26"
            cy="26"
            r={R}
            fill="none"
            stroke="#e8c860"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - Math.min(1, Math.max(0, progress)))}
            style={{ transition: "stroke-dashoffset .25s linear" }}
          />
        </svg>
        {/* 黑膠唱片：一直在轉 */}
        <svg
          viewBox="0 0 100 100"
          className="vinyl-spin relative"
          style={{ width: 36, height: 36, filter: "drop-shadow(0 1px 3px rgba(0,0,0,.55))" }}
          aria-hidden
        >
          <circle cx="50" cy="50" r="48" fill="#181410" />
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(232,200,96,.4)" strokeWidth="2.5" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="1.5" />
          <path d="M 50 5 A 45 45 0 0 1 88.9 27.5" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="50" cy="50" r="15" fill="#e8c860" />
          <circle cx="50" cy="50" r="15" fill="none" stroke="#c9a227" strokeWidth="2" />
          <circle cx="50" cy="50" r="3.2" fill="#f8efd9" />
        </svg>
      </button>

      {/* 曲目小列表 */}
      {open && (
        <>
          {/* 透明底層：撳出面收起 */}
          <div className="fixed inset-0 z-[24]" onClick={() => setOpen(false)} />
          <div
            className="card-parchment absolute right-3 top-[144px] z-[25] w-[210px] rounded-xl p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1.5 px-1.5 text-[11px] text-ink-soft">{t("title")}</p>
            <div className="flex flex-col gap-0.5">
              {list.map((track) => {
                const playing = currentId === track.id;
                return (
                  <button
                    key={track.id}
                    onClick={() => pick(track.id)}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink transition-colors ${
                      playing ? "bg-gold/15 ring-1 ring-gold" : "bg-white/40"
                    }`}
                  >
                    <span className={`w-4 shrink-0 text-center text-[11px] ${playing ? "text-gold" : "text-transparent"}`}>
                      ▶
                    </span>
                    <span className="min-w-0 flex-1 truncate">{track.label}</span>
                  </button>
                );
              })}
            </div>
            {/* 控制列：停止/繼續播放 ＋ 播放模式 */}
            <div className="mt-1.5 border-t border-ink-soft/20 pt-1.5">
              {/* 停止/繼續播放 */}
              <button
                onClick={() => {
                  sfxTap();
                  if (paused) resumeMusic();
                  else pauseMusic();
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] text-ink transition-colors ${
                  paused ? "bg-gold/15 ring-1 ring-gold" : "bg-white/40"
                }`}
              >
                <span className="text-[13px] leading-none">{paused ? "▶" : "⏸"}</span>
                {paused ? t("resume") : t("stop")}
              </button>
              {/* 播放模式：重複播放（亮＝播完重複；熄＝自動下一首） */}
              <button
                onClick={() => {
                  sfxTap();
                  setMusicMode(mode === "repeat" ? "next" : "repeat");
                }}
                className={`mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] text-ink transition-colors ${
                  mode === "repeat" ? "bg-gold/15 ring-1 ring-gold" : "bg-white/40"
                }`}
              >
                <span className="text-[13px] leading-none">🔁</span>
                {t("repeat")}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
