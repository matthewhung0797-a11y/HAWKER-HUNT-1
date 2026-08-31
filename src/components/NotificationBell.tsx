"use client";

// 站內通知鈴鐺（地圖頁）：未讀紅點 → 點開通知列表（parchment modal）。
// - 通知來源：後台「推送通知」（全服 or 指定玩家），近 30 日最新 30 條。
// - 已讀追蹤：localStorage（hh-notif-read：id 陣列，cap 100）。
// - 有 link 的通知點擊後跳轉站內路由。

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getUser } from "@/lib/auth";
import { getMyNotifications } from "@/lib/admin/actions";
import type { MyNotification } from "@/lib/admin/types";
import { sfxTap } from "@/lib/sfx";

const READ_KEY = "hh-notif-read";
const READ_CAP = 100;

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>): void {
  try {
    const arr = [...ids].slice(-READ_CAP);
    localStorage.setItem(READ_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export default function NotificationBell() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const [items, setItems] = useState<MyNotification[] | null>(null);
  const [open, setOpen] = useState(false);
  // 惰性初始：SSR 冇 localStorage，client 首 render 即有已讀集（免 effect 內同步 setState）
  const [readIds, setReadIds] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set<string>() : loadReadIds()
  );

  // mount 後：拉通知（有登入＝廣播＋指定我；訪客＝只睇全服廣播）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getUser().catch(() => null);
      if (cancelled) return;
      const list = await getMyNotifications(user?.id).catch(() => [] as MyNotification[]);
      if (!cancelled) setItems(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const n of items ?? []) next.add(n.id);
      saveReadIds(next);
      return next;
    });
  }, [items]);

  if (!items || items.length === 0) return null; // 冇通知就唔顯示鈴鐺

  const unread = items.filter((n) => !readIds.has(n.id)).length;

  function openPanel() {
    sfxTap();
    setOpen(true);
    markAllRead();
  }

  function tapItem(n: MyNotification) {
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <>
      <button
        onClick={openPanel}
        className="fixed z-30 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-gold bg-black/60 shadow-lg backdrop-blur-sm transition-transform active:scale-90"
        style={{
          touchAction: "manipulation",
          // 與任務按鈕（52px）同尺寸同一垂直欄上下排列：任務按鈕頂緣在 50vh-52px（52px 高 + translateY(-100%)），
          // 鈴鐺（52px 高）墊在任務上方再留 8px 間隙 → top = 50vh - 52 - 8 - 52
          top: "calc(50% - 112px)",
          left: "max(0px, calc(50vw - min(50vw, calc(50vh * 9 / 16))))",
        }}
        aria-label={t("notifications.title")}
      >
        <span className="text-xl leading-none">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-chilli px-1 text-[10px] font-black text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="card-parchment max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-ink">🔔 {t("notifications.title")}</h2>
              <button onClick={() => setOpen(false)} className="text-2xl font-bold text-ink-soft" aria-label={t("common.close")}>
                ✕
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => tapItem(n)}
                    className={`w-full rounded-xl border-2 p-3 text-left ${
                      readIds.has(n.id)
                        ? "border-ink-soft/20 bg-parchment-dark/40 opacity-70"
                        : "border-gold/60 bg-white/60"
                    } ${n.link ? "active:scale-[0.98]" : "cursor-default"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{n.icon || "📣"}</span>
                      <span className="flex-1 text-sm font-black text-ink">{n.title}</span>
                      {n.link && <span className="text-xs text-pandan">→</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs font-bold leading-relaxed text-ink-soft">
                      {n.body}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-soft/60">
                      {new Date(n.createdAt).toLocaleString(locale === "zh" ? "zh-HK" : "en-HK")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
