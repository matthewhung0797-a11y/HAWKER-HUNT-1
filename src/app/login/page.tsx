"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import { loginAndSync } from "@/lib/cloud-save";
import { isAuthConfigured, upgradeWithEmail, upgradeWithFacebook, upgradeWithGoogle } from "@/lib/auth";
import UIIcon from "@/components/UIIcon";

/** Google 官方四色 G logo */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.7-.2-3.3-.5-4.9H24v9.3h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6C44.1 38 46.5 31.8 46.5 24.5Z" />
      <path fill="#FBBC05" d="M10.5 28.6a14.7 14.7 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2Z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.7-6c-2.1 1.4-4.8 2.3-7.5 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.2C6.5 42.6 14.6 48 24 48Z" />
    </svg>
  );
}

export default function LoginPage() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const login = useGameStore((s) => s.login);
  const nickname = useGameStore((s) => s.nickname);
  const setNickname = useGameStore((s) => s.setNickname);
  const [busy, setBusy] = useState(false);

  /** 訪客 / 匿名登入：有配置 Supabase 就開匿名帳號 + 拉雲存檔，否則純本地。 */
  async function guestLogin() {
    if (busy) return;
    setBusy(true);
    try {
      // 有配置就建立匿名 session 並同步雲存檔（會 merge 返舊進度）
      await loginAndSync();
    } catch {
      // 忽略：離線 / 未配置照樣本地登入
    }
    if (!nickname) setNickname(`Hunter${Math.floor(1000 + Math.random() * 9000)}`);
    login();
    router.push("/map");
  }

  /** Google 升級：未配置就退回訪客。會 redirect 出去 Google，返嚟 /map 由雲存檔接手。 */
  async function googleLogin() {
    if (busy) return;
    if (!isAuthConfigured) return guestLogin();
    setBusy(true);
    await loginAndSync(); // 先確保有匿名 session（linkIdentity 保留進度）
    if (!nickname) setNickname(`Hunter${Math.floor(1000 + Math.random() * 9000)}`);
    login();
    const res = await upgradeWithGoogle();
    if (!res.ok) {
      // 綁定失敗（例如未喺 Supabase 開 Google provider）：照以匿名身分入場
      router.push("/map");
    }
    // 成功會 redirect 去 Google，返嚟 /map
  }

  /** Facebook 升級：同 Google 模式 — 先匿名 session 再 linkIdentity，redirect 出 Facebook。 */
  async function facebookLogin() {
    if (busy) return;
    if (!isAuthConfigured) return guestLogin();
    setBusy(true);
    await loginAndSync();
    if (!nickname) setNickname(`Hunter${Math.floor(1000 + Math.random() * 9000)}`);
    login();
    const res = await upgradeWithFacebook();
    if (!res.ok) {
      router.push("/map");
    }
  }

  /** Email 升級：send magic-link / 確認信；未配置退回訪客。 */
  async function emailLogin() {
    if (busy) return;
    if (!isAuthConfigured) return guestLogin();
    const email = window.prompt(locale === "zh" ? "輸入電郵接收登入連結：" : "Enter email for login link:");
    if (!email) return;
    setBusy(true);
    await loginAndSync();
    if (!nickname) setNickname(`Hunter${Math.floor(1000 + Math.random() * 9000)}`);
    login();
    const res = await upgradeWithEmail(email.trim());
    window.alert(
      res.ok
        ? locale === "zh"
          ? "已寄出登入 / 確認連結，請查電郵。你而家可以先繼續遊玩。"
          : "Login/confirmation link sent — check your email. You can keep playing meanwhile."
        : locale === "zh"
          ? `電郵登入暫時未得：${res.error ?? ""}`
          : `Email login unavailable: ${res.error ?? ""}`
    );
    router.push("/map");
  }

  return (
    <main className="tile-frame paper-texture flex min-h-dvh flex-col overflow-hidden pb-[calc(70px_+_env(safe-area-inset-bottom))] items-center justify-center gap-8 px-8 py-10">
      <div className="flex flex-col items-center gap-2">
        <UIIcon name="chopsticks" size={72} className="drop-shadow-lg" />
        <h1 className="game-title text-4xl font-black tracking-wide text-chilli">Hawker Hunt</h1>
        <p className="mt-2 text-center text-xl font-bold text-ink">{t("auth.welcome")}</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button onClick={googleLogin} disabled={busy} className="btn-outline flex items-center justify-center gap-3 px-6 py-3.5 font-bold disabled:opacity-60">
          <GoogleG /> {t("auth.googleLogin")}
        </button>
        <button onClick={facebookLogin} disabled={busy} className="btn-outline flex items-center justify-center gap-3 px-6 py-3.5 font-bold disabled:opacity-60">
          <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#1877F2"
              d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3v-3.5h3V9.4c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.3h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z"
            />
          </svg>
          {t("auth.facebookLogin")}
        </button>
        <button onClick={emailLogin} disabled={busy} className="btn-outline flex items-center justify-center gap-3 px-6 py-3.5 font-bold disabled:opacity-60">
          <UIIcon name="envelope" size={18} /> {t("auth.emailLogin")}
        </button>
        <button onClick={guestLogin} disabled={busy} className="btn-gold px-6 py-4 text-lg font-black disabled:opacity-60">
          {t("auth.guestMode")}
        </button>
      </div>

      <p className="max-w-xs text-center text-xs text-ink-soft">{t("auth.terms")}</p>
    </main>
  );
}
