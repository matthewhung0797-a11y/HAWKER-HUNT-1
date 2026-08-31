"use client";

// 後台登入：Supabase Auth email + 密碼 → server action 簽 httpOnly cookie。

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/admin/actions";

export default function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    startTransition(async () => {
      try {
        const res = await login(email, password);
        if (res.ok) {
          router.refresh();
        } else {
          setError(res.error ?? "登入失敗");
        }
      } catch {
        setError("登入失敗，請稍後再試");
      }
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div className="mb-6 text-center">
          <div className="text-3xl">🍜</div>
          <h1 className="mt-2 text-xl font-black text-slate-900">Hawker Hunt 管理後台</h1>
          <p className="mt-1 text-xs text-slate-500">僅限授權管理人員登入</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {error}
          </div>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-bold text-slate-600">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-xs font-bold text-slate-600">密碼</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "登入中…" : "登入"}
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          帳號需先由超級管理員登記於 admin_users，
          <br />
          並以同一 email 開通 Supabase Auth 帳號。
        </p>
      </form>
    </div>
  );
}
