"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import jsQR from "jsqr";
import { CENTRE_MAP, GEOFENCE_RADIUS_TOLERANT_M } from "@/content/centres";
import { SPECIES_MAP } from "@/content/species";
import { ITEM_MAP } from "@/content/items";
import { distanceM } from "@/lib/geo";
import { useGameStore } from "@/lib/store";
import SpiritIcon from "@/components/SpiritIcon";
import UIIcon from "@/components/UIIcon";
import Confetti from "@/components/Confetti";
import { sfxReward } from "@/lib/sfx";
import { track } from "@/lib/analytics/track";

/**
 * QR 內容格式（實體貼紙）：
 *   https://<domain>/c/{centreId}  或  hawkerhunt:checkin:{centreId}
 * 域名唔寫死（vercel.app 測試域／將來正式域都認），淨係認 http(s) URL 嘅 /c/<id> 路徑；
 * ID 有效性由下游 CENTRE_MAP 把關。Supabase 階段會改為簽名 URL + Edge Function 驗證。
 */
function parseQR(data: string): string | null {
  const urlMatch = data.match(/^https?:\/\/[^\s/]+\/c\/([a-z0-9-]+)(?:[/?#]|$)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  const schemeMatch = data.match(/^hawkerhunt:checkin:([a-z0-9-]+)$/i);
  if (schemeMatch) return schemeMatch[1].toLowerCase();
  return null;
}

type Phase = "scanning" | "verifying" | "success" | "error";

function CheckinInner() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const params = useSearchParams();
  const targetCentreId = params.get("centre");

  const store = useGameStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("scanning");
  const [errorMsg, setErrorMsg] = useState("");
  const [rewards, setRewards] = useState<{ itemId: string; qty: number }[]>([]);
  const [centreId, setCentreId] = useState<string | null>(null);
  /** 重試時遞增，逼 camera／scan loop useEffect 重跑（doneRef 鎖住後 loop 會停） */
  const [scanGen, setScanGen] = useState(0);

  const fail = useCallback((msg: string) => {
    doneRef.current = true;
    setErrorMsg(msg);
    setPhase("error");
  }, []);

  const handleScanned = useCallback(
    (scannedCentreId: string, opts?: { skipGps?: boolean }) => {
      if (doneRef.current) return;
      const centre = CENTRE_MAP[scannedCentreId];
      if (!centre || (targetCentreId && scannedCentreId !== targetCentreId)) {
        fail(t("checkin.wrongCode"));
        return;
      }
      if (store.todayCheckinCount(scannedCentreId) >= centre.dailyCheckinLimit) {
        fail(t("checkin.limitError"));
        return;
      }
      const cooldownMs = store.checkinCooldownRemainingMs(scannedCentreId);
      if (cooldownMs > 0) {
        fail(
          t("checkin.cooldownError", {
            minutes: Math.max(1, Math.ceil(cooldownMs / 60_000)),
          })
        );
        return;
      }

      const succeed = () => {
        doneRef.current = true;
        const r = store.checkin(scannedCentreId);
        track("checkin", { centreId: scannedCentreId });
        setRewards(r);
        setCentreId(scannedCentreId);
        setPhase("success");
        sfxReward();
      };

      // GPS hard gate：超距／拒定位／逾時／冇 geolocation API 一律拒——防屋企掃 QR 複本。
      // 淨係 development＋devMode 嘅 Simulate 掣先 skipGps；真掃 QR（含 dev）一律過圍欄。
      if (
        opts?.skipGps &&
        process.env.NODE_ENV === "development" &&
        store.devMode
      ) {
        succeed();
        return;
      }
      if (!navigator.geolocation) {
        fail(t("checkin.locationUnavailable"));
        return;
      }

      // 鎖住掃描 loop，顯示「核對位置」——避免重複掃同一張 QR
      doneRef.current = true;
      setPhase("verifying");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = distanceM(pos.coords.latitude, pos.coords.longitude, centre.lat, centre.lng);
          const metres = Math.round(d);
          if (d > GEOFENCE_RADIUS_TOLERANT_M) {
            fail(
              t("checkin.tooFarError", {
                distance: metres,
                limit: GEOFENCE_RADIUS_TOLERANT_M,
              })
            );
            return;
          }
          succeed();
        },
        (err) => {
          // PERMISSION_DENIED = 1；其餘當逾時／訊號弱
          if (err?.code === 1) fail(t("checkin.locationDenied"));
          else fail(t("checkin.locationUnavailable"));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    },
    [store, t, targetCentreId, fail]
  );

  // Playwright／本機診斷用：真掃路徑（唔 skip GPS）
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as Window & { __checkinScan?: (id: string) => void };
    w.__checkinScan = (id: string) => handleScanned(id);
    return () => {
      delete w.__checkinScan;
    };
  }, [handleScanned]);

  // 鏡頭 + QR 掃描循環
  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanLoop();
      } catch {
        setErrorMsg(t("capture.cameraDenied"));
        setPhase("error");
      }
    }

    function scanLoop() {
      if (!active || doneRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = (canvas.width = video.videoWidth);
        const h = (canvas.height = video.videoHeight);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && w > 0) {
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
          if (code) {
            const parsed = parseQR(code.data);
            if (parsed) {
              handleScanned(parsed);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    }

    start();
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [handleScanned, t, scanGen]);

  const centre = centreId ? CENTRE_MAP[centreId] : null;
  const silhouetteSpecies = centre ? SPECIES_MAP[centre.spawnPool[0]] : null;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden pb-[calc(70px_+_env(safe-area-inset-bottom))] bg-black">
      {/* 鏡頭畫面 */}
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      {(phase === "scanning" || phase === "verifying") && (
        <>
          <div className="z-10 mt-16 text-center">
            <h1 className="text-xl font-black text-white drop-shadow">{t("checkin.scanTitle")}</h1>
          </div>
          {/* 掃描框 */}
          <div className="z-10 mx-auto mt-8 h-64 w-64 rounded-2xl border-4 border-pandan shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            <div className="h-full w-full animate-pulse rounded-xl border-2 border-white/40" />
          </div>
          <p className="z-10 mt-6 text-center text-sm font-bold text-white drop-shadow">
            {phase === "verifying" ? t("checkin.verifying") : t("checkin.scanHint")}
          </p>
          {/* 模擬掃描係開發專用：以前跟 store.devMode（玩家自己喺個人檔案開得），
              等於 production 都撳得到＝唔掃 QR 都打到卡。收緊到只喺 dev build 存在。 */}
          {phase === "scanning" &&
            process.env.NODE_ENV === "development" &&
            store.devMode &&
            targetCentreId && (
              <button
                onClick={() => handleScanned(targetCentreId, { skipGps: true })}
                className="z-10 mx-auto mt-6 btn-gold px-6 py-3 text-sm font-black"
              >
                [DEV] Simulate Scan
              </button>
            )}
        </>
      )}

      {phase === "success" && centre && silhouetteSpecies && (
        <div className="z-10 flex flex-1 flex-col items-center justify-center gap-5 bg-black/60 px-8 text-center">
          <Confetti count={22} />
          <div className="relative flex h-40 w-40 items-center justify-center">
            <div className="burst-ring absolute inset-0 rounded-full border-4 border-gold" />
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-b from-gold-light to-gold shadow-[0_0_40px_rgba(232,200,96,0.8)]">
              <SpiritIcon speciesId={silhouetteSpecies.id} size={90} silhouette />
            </div>
          </div>
          <h1 className="rounded-xl bg-parchment px-8 py-3 text-3xl font-black text-chilli shadow-lg">
            {t("checkin.success")}
          </h1>
          <p className="text-base font-bold text-gold-light">{t("checkin.newSilhouette")}</p>
          <div className="card-parchment flex w-full max-w-sm flex-col gap-2 px-6 py-4 text-left text-sm font-bold text-ink">
            <span className="text-center text-xs font-black text-ink-soft">
              {t("checkin.progress", {
                current: store.todayCheckinCount(centre.id),
                total: centre.dailyCheckinLimit,
              })}
            </span>
            <p className="text-center text-base font-black text-ink">{t("checkin.rewardsTitle")}</p>
            {rewards.map((r, i) => {
              const isChop = r.itemId === "chopsticks";
              return (
                <div
                  key={`${r.itemId}-${i}`}
                  className="reward-pop flex items-center gap-2 rounded-xl bg-parchment-dark/50 px-3 py-2"
                  style={{ animationDelay: `${0.2 + i * 0.18}s` }}
                >
                  <UIIcon name={ITEM_MAP[r.itemId]?.icon ?? "star"} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-black">
                      {ITEM_MAP[r.itemId]?.name[locale] ?? r.itemId} ×{r.qty}
                    </div>
                    <div className="text-[11px] font-bold text-ink-soft">
                      {isChop ? t("checkin.rewardChopsticks") : t("checkin.rewardMaterial")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/capture?centre=${centre.id}`)}
              className="btn-gold flex items-center gap-1.5 px-8 py-3.5 text-lg font-black"
            >
              <UIIcon name="chopsticks" size={22} /> {t("nav.capture")}
            </button>
            <button onClick={() => router.push("/map")} className="btn-outline px-6 py-3.5 font-bold">
              {t("capture.keepExploring")}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="z-10 flex flex-1 flex-col items-center justify-center gap-5 bg-black/60 px-8 text-center">
          <div className="text-6xl">😅</div>
          <p className="max-w-sm text-lg font-bold text-white">{errorMsg}</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                doneRef.current = false;
                setErrorMsg("");
                setPhase("scanning");
                setScanGen((n) => n + 1); // 重開鏡頭＋掃描 loop，方便行近／開定位後再掃
              }}
              className="btn-gold px-8 py-3 font-black"
            >
              {t("common.retry")}
            </button>
            <button onClick={() => router.push("/map")} className="btn-outline px-6 py-3 font-bold">
              {t("common.back")}
            </button>
          </div>
        </div>
      )}

      {/* 退出 */}
      {(phase === "scanning" || phase === "verifying") && (
        <button
          onClick={() => router.push("/map")}
          className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
          aria-label={t("common.back")}
        >
          ←
        </button>
      )}
    </main>
  );
}

export default function CheckinPage() {
  return (
    <Suspense>
      <CheckinInner />
    </Suspense>
  );
}
