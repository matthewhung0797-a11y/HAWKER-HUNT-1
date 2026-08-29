"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isCapacitorNative } from "@/lib/capacitor";

/** Chrome/Android 嘅 beforeinstallprompt 事件（未入標準 lib.dom 型別，自己補） */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// 沉浸式／後台頁面唔好彈安裝橫額（阻住玩、阻住管理）
const HIDDEN_PREFIXES = ["/admin", "/login", "/onboarding", "/capture", "/battle", "/evolve", "/checkin", "/c/"];
const DISMISS_KEY = "hh-install-dismissed";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari 專用旗標
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function recentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const t = useTranslations("install");
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [iosSheet, setIosSheet] = useState(false);

  useEffect(() => {
    // Don't show PWA install prompt inside a Capacitor native app
    if (isCapacitorNative()) return;
    if (isStandalone() || recentlyDismissed()) return;

    // Android/桌面 Chromium：攔截原生安裝提示，改由我哋自己個掣觸發
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // 裝完即收起
    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS 收唔到 beforeinstallprompt——自行偵測，用引導取代
    if (isIOS()) {
      setIos(true);
      const timer = setTimeout(() => setShow(true), 1800);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBIP);
        window.removeEventListener("appinstalled", onInstalled);
        clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    setIosSheet(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (ios) {
      setIosSheet(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setShow(false);
  };

  if (!show) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p))) return null;

  return (
    <>
      {/* 安裝橫額：坐喺底部導航之上 */}
      <div
        className="fixed inset-x-0 z-40 flex justify-center px-3"
        style={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="card-parchment slide-up flex w-full max-w-md items-center gap-3 p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chilli/15">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b03a2e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12" />
              <path d="m8 11 4 4 4-4" />
              <path d="M5 21h14" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-ink">{t("bannerTitle")}</div>
            <div className="truncate text-xs text-ink-soft">{t("bannerBody")}</div>
          </div>
          <button onClick={install} className="btn-gold shrink-0 px-4 py-2 text-sm font-black">
            {t("button")}
          </button>
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full px-2 text-lg text-ink-soft"
            aria-label={t("dismiss")}
            data-no-press-sfx
          >
            ✕
          </button>
        </div>
      </div>

      {/* iOS 引導 sheet：教用戶用「分享 → 加入主畫面」 */}
      {iosSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={dismiss}>
          <div
            className="slide-up mx-auto w-full max-w-md rounded-t-3xl card-parchment p-6 pb-8"
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-ink">{t("iosTitle")}</h2>
              <button onClick={dismiss} className="rounded-full px-2 text-xl text-ink-soft" aria-label={t("dismiss")}>
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-ink-soft">{t("iosBody")}</p>
            <ol className="flex flex-col gap-3">
              {[t("iosStep1"), t("iosStep2"), t("iosStep3")].map((step, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chilli font-black text-white">
                    {i + 1}
                  </span>
                  <span className="text-sm font-bold text-ink">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
