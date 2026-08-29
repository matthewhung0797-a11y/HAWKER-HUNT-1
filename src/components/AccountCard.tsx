"use client";

// Profile 頁嘅帳號區：顯示雲存檔狀態，訪客（匿名）可升級綁 Google / Email。
// 未配置 Supabase 就顯示「離線模式」，唔會有升級掣。

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";
import {
  getUser,
  isAnonUser,
  isAuthConfigured,
  onAuthChange,
  signOut,
  upgradeWithEmail,
  upgradeWithGoogle,
} from "@/lib/auth";
import UIIcon from "@/components/UIIcon";

export default function AccountCard() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthConfigured) return;
    void getUser().then(setUser);
    return onAuthChange(setUser);
  }, []);

  // 未配置 Supabase：離線模式提示
  if (!isAuthConfigured) {
    return (
      <div className="card-parchment flex items-center gap-2 p-4 text-sm font-bold text-ink-soft">
        <UIIcon name="wrench" size={18} /> {t("account.cloudOff")}
      </div>
    );
  }

  // user 為 null（配置咗但未登入）＝當訪客處理：顯示綁定引導，唔好誤報「已綁定」
  const anon = !user || isAnonUser(user);

  async function doGoogle() {
    if (busy) return;
    setBusy(true);
    const res = await upgradeWithGoogle();
    if (!res.ok) {
      window.alert(res.error ?? "error");
      setBusy(false);
    }
    // 成功會 redirect 出 Google
  }

  async function doEmail() {
    if (busy) return;
    const email = window.prompt(t("account.emailPrompt"));
    if (!email) return;
    setBusy(true);
    const res = await upgradeWithEmail(email.trim());
    window.alert(res.ok ? t("account.emailSent") : (res.error ?? "error"));
    setBusy(false);
  }

  return (
    <div className="card-parchment flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <UIIcon name="person" size={18} />
        {anon ? t("account.guestAccount") : (user?.email ?? t("account.linked"))}
        {!anon && (
          <span className="rounded-full bg-pandan/20 px-2 py-0.5 text-[10px] font-black text-pandan">
            {t("account.linked")}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-soft">
        {anon ? t("account.guestHint") : t("account.cloudOn")}
      </p>

      {anon ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={doGoogle}
            disabled={busy}
            className="btn-outline flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {t("account.upgradeGoogle")}
          </button>
          <button
            onClick={doEmail}
            disabled={busy}
            className="btn-outline flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            <UIIcon name="envelope" size={16} /> {t("account.upgradeEmail")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setBusy(true);
            void signOut().finally(() => setBusy(false));
          }}
          disabled={busy}
          className="btn-outline px-4 py-2 text-sm font-bold disabled:opacity-60"
        >
          {t("account.signOut")}
        </button>
      )}
    </div>
  );
}
