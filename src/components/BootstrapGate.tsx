"use client";

// 遊戲端啟動閘門：維護畫面（上下架）→ 強制更新 → 全服公告（popup 彈窗一次 / banner 頂部橫幅）。
// - /admin、/founder 不受影響（管理後台要能隨時進去關維護）。
// - 已讀公告記 localStorage（hh-ann-<id>）。
// - 任何錯誤靜靜跳過（遊戲照跑）——寧可漏放公告，不可阻擋玩家。

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { getBootstrapConfig } from "@/lib/admin/actions";
import { APP_VERSION } from "@/lib/analytics/events";
import type { BootstrapConfig } from "@/lib/admin/types";

/** a < b（semver 粗比較：逐段數字） */
function versionLt(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

function dismissedKey(id: string): string {
  return `hh-ann-${id}`;
}

/** 後台 / founder 路徑不受閘門影響 */
function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/founder");
}

function AnnouncementPopup({ cfg }: { cfg: BootstrapConfig }) {
  const t = useTranslations();
  const [current, setCurrent] = useState(() => {
    const first = cfg.announcements.find(
      (a) => a.kind === "popup" && typeof window !== "undefined" && !localStorage.getItem(dismissedKey(a.id))
    );
    return first ?? null;
  });

  if (!current) return null;

  function dismiss() {
    const ann = current;
    if (!ann) return;
    try {
      localStorage.setItem(dismissedKey(ann.id), "1");
    } catch {
      /* ignore */
    }
    setCurrent(null);
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-6">
      <div className="card-parchment w-full max-w-sm rounded-2xl border-4 border-gold/60 p-6 text-center">
        <div className="text-3xl">📣</div>
        <h2 className="mt-2 text-lg font-black text-ink">{current.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-relaxed text-ink-soft">
          {current.body}
        </p>
        <button
          onClick={dismiss}
          className="btn-gold mt-5 w-full py-2.5 text-base font-black"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

function AnnouncementBanners({ cfg }: { cfg: BootstrapConfig }) {
  const t = useTranslations();
  const [hidden, setHidden] = useState<string[]>([]);
  const banners = cfg.announcements.filter((a) => {
    if (a.kind !== "banner") return false;
    if (hidden.includes(a.id)) return false;
    try {
      return !localStorage.getItem(dismissedKey(a.id));
    } catch {
      return true;
    }
  });
  if (banners.length === 0) return null;

  function close(id: string) {
    try {
      localStorage.setItem(dismissedKey(id), "1");
    } catch {
      /* ignore */
    }
    setHidden((h) => [...h, id]);
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[500] flex flex-col gap-px">
      {banners.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 bg-ink/95 px-3 py-2 text-center shadow-lg"
          role="status"
        >
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-parchment-light">
            📣 {a.title}
          </span>
          <button
            onClick={() => close(a.id)}
            aria-label={t("common.close")}
            className="shrink-0 rounded-full px-1.5 text-xs font-black text-parchment-light/70"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default function BootstrapGate() {
  const pathname = usePathname();
  const t = useTranslations();
  const [cfg, setCfg] = useState<BootstrapConfig | null>(null);

  useEffect(() => {
    // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
    if (isAdminPath(pathname)) return;
    let cancelled = false;
    getBootstrapConfig().then(
      (c) => {
        if (!cancelled) setCfg(c);
      },
      () => {
        /* 寧可漏放公告，不可阻擋玩家 */
      }
    );
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // 後台 / founder 不閘（管理員要能進去關維護）——render 時判定，唔靠 effect setState
  if (isAdminPath(pathname) || !cfg) return null;

  // 1) 維護模式（下架）
  if (cfg.maintenance.enabled) {
    return (
      <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#1a0e04] p-8 text-center">
        <div className="text-5xl">🍜</div>
        <h1 className="mt-4 text-2xl font-black text-[#f3e5c8]">{t("sys.maintenanceTitle")}</h1>
        <p className="mt-3 max-w-sm text-sm font-bold leading-relaxed text-[#cbb98e]">
          {cfg.maintenance.message || t("sys.maintenanceDefault")}
        </p>
      </div>
    );
  }

  // 2) 強制更新
  if (cfg.version.forceUpdate && versionLt(APP_VERSION, cfg.version.minVersion)) {
    return (
      <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#1a0e04] p-8 text-center">
        <div className="text-5xl">⬆️</div>
        <h1 className="mt-4 text-2xl font-black text-[#f3e5c8]">{t("sys.updateTitle")}</h1>
        <p className="mt-3 max-w-sm text-sm font-bold leading-relaxed text-[#cbb98e]">
          {t("sys.updateBody")}
        </p>
        {cfg.version.androidUrl && (
          <a
            href={cfg.version.androidUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 rounded-full bg-gold px-8 py-3 text-base font-black text-ink"
          >
            {t("sys.updateBtn")}
          </a>
        )}
      </div>
    );
  }

  // 3) 公告
  return (
    <>
      <AnnouncementPopup cfg={cfg} />
      <AnnouncementBanners cfg={cfg} />
    </>
  );
}
