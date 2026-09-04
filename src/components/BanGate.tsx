"use client";

// 封禁閘門：登入用戶若被後台封禁 → 全屏封鎖畫面＋登出。
// 與 BootstrapGate 同級：每次頁面載入/登入狀態變化都重查一次。
// /admin、/founder 不受影響（管理員自己唔會ban自己）。

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { getUser, onAuthChange, signOut } from "@/lib/auth";
import { getMyBanStatus } from "@/lib/admin/actions";

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/founder");
}

type BanInfo = { reason: string | null; bannedUntil: string | null };

export default function BanGate() {
  const pathname = usePathname();
  const t = useTranslations();
  const [ban, setBan] = useState<BanInfo | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (isAdminPath(pathname)) return;
    let cancelled = false;

    async function check() {
      const user = await getUser();
      if (!user) return;
      try {
        const status = await getMyBanStatus(user.id);
        if (cancelled || !status.banned) return;
        setBan({ reason: status.reason, bannedUntil: status.bannedUntil });
        // 被 ban 即登出（唔俾繼續同步存檔／做任何操作）
        await signOut().catch(() => {});
        if (!cancelled) setSignedOut(true);
      } catch {
        /* 查唔到唔阻住玩（寧可漏攔，不可誤封） */
      }
    }

    void check();
    // 登入狀態變化（OAuth redirect 返嚟／升級帳號）再查一次
    const unsub = onAuthChange(() => {
      void check();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [pathname]);

  if (isAdminPath(pathname) || !ban) return null;

  const untilText = ban.bannedUntil
    ? new Date(ban.bannedUntil).toLocaleDateString(
        typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh-TW" : "en-SG"
      )
    : null;

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#1a0e04] p-8 text-center">
      <div className="text-5xl">🚫</div>
      <h1 className="mt-4 text-2xl font-black text-[#f3e5c8]">{t("sys.bannedTitle")}</h1>
      <p className="mt-3 max-w-sm text-sm font-bold leading-relaxed text-[#cbb98e]">
        {t("sys.bannedBody")}
      </p>
      {ban.reason && (
        <p className="mt-2 max-w-sm rounded-xl bg-black/40 px-4 py-2 text-sm text-[#e8c860]">
          {ban.reason}
        </p>
      )}
      {untilText && (
        <p className="mt-2 text-xs text-[#cbb98e]">
          {t("sys.bannedUntil")}: {untilText}
        </p>
      )}
      {signedOut && (
        <a
          href="/"
          className="mt-6 rounded-full border border-[#cbb98e] px-8 py-2.5 text-sm font-bold text-[#cbb98e]"
        >
          {t("sys.bannedBack")}
        </a>
      )}
    </div>
  );
}
