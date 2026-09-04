"use client";

// 後台 shell（螢幕自適應）：
// - 桌面（md+）：左側深色 sidebar。
// - 手機：頂欄（漢堡＋目前頁面）＋滑出抽屜導航。
// section 由 URL 決定（server page 傳入），可刷新 / 書籤。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logout } from "@/lib/admin/actions";
import { capsOf, ROLE_LABELS, type AdminRole, type Cap } from "@/lib/admin/types";
import DashboardView from "./views/DashboardView";
import PlayersView from "./views/PlayersView";
import OpsView from "./views/OpsView";
import ReportsView from "./views/ReportsView";
import AdminsView from "./views/AdminsView";
import SpiritsView from "./views/SpiritsView";
import CentresView from "./views/CentresView";
import MissionsView from "./views/MissionsView";
import DataView from "./views/DataView";
import NotificationsView from "./views/NotificationsView";
import MusicAdminView from "./views/MusicAdminView";

interface NavItem {
  id: string;
  label: string;
  cap: Cap;
  icon: string;
}

const NAV: readonly NavItem[] = [
  { id: "overview", label: "總覽", cap: "dashboard", icon: "📊" },
  { id: "players", label: "玩家管理", cap: "players:read", icon: "👤" },
  { id: "spirits", label: "精靈管理", cap: "spirits:manage", icon: "🐔" },
  { id: "centres", label: "據點管理", cap: "centres:manage", icon: "📍" },
  { id: "missions", label: "任務管理", cap: "missions:manage", icon: "🎯" },
  { id: "music", label: "音樂管理", cap: "ops:manage", icon: "🎵" },
  { id: "notifications", label: "推送通知", cap: "notify:send", icon: "🔔" },
  { id: "ops", label: "營運設定", cap: "ops:manage", icon: "🛠️" },
  { id: "reports", label: "數據報表", cap: "reports:read", icon: "📈" },
  { id: "data", label: "數據管理", cap: "data:manage", icon: "🗄️" },
  { id: "admins", label: "系統管理", cap: "admins:manage", icon: "⚙️" },
];

export default function AdminApp({
  email,
  role,
  section,
}: {
  email: string;
  role: AdminRole;
  section: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const caps = capsOf(role);
  const nav = NAV.filter((n) => caps.includes(n.cap));
  const requested = section[0] ?? "overview";
  const active = nav.some((n) => n.id === requested) ? requested : "overview";
  const activeLabel = NAV.find((n) => n.id === active)?.label ?? "總覽";

  function handleLogout() {
    startTransition(async () => {
      await logout();
      router.refresh();
    });
  }

  // 帳號區塊（sidebar / 抽屜共用）
  const userBlock = (
    <div className="space-y-2 border-t border-slate-800 p-3 text-xs">
      <div>
        <div className="truncate font-medium text-slate-200">{email}</div>
        <div className="text-slate-500">{ROLE_LABELS[role]}</div>
      </div>
      <button
        onClick={handleLogout}
        disabled={pending}
        className="w-full rounded-lg bg-slate-800 py-1.5 font-bold text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50"
      >
        {pending ? "…" : "登出"}
      </button>
    </div>
  );

  // 導航清單（sidebar / 抽屜共用；onNavigate 俾抽屜點完自動收）
  const navList = (onNavigate: () => void) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
      {nav.map((n) => (
        <Link
          key={n.id}
          href={n.id === "overview" ? "/admin" : `/admin/${n.id}`}
          onClick={onNavigate}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
            active === n.id ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 hover:text-white"
          }`}
        >
          <span aria-hidden>{n.icon}</span>
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-slate-100">
      {/* 桌面 sidebar（md+） */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-slate-900 text-slate-300 md:flex">
        <div className="border-b border-slate-800 px-4 py-5">
          <div className="text-base font-black tracking-wide text-white">🍜 HH 管理後台</div>
        </div>
        {navList(() => {})}
        {userBlock}
      </aside>

      {/* 手機漢堡抽屜 */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="relative flex h-full w-64 max-w-[82%] flex-col bg-slate-900 text-slate-300 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
              <div className="text-base font-black tracking-wide text-white">🍜 HH 管理後台</div>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="關閉選單"
              >
                ✕
              </button>
            </div>
            {navList(() => setMenuOpen(false))}
            {userBlock}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 手機頂欄 */}
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-3 py-3 text-white md:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            className="-ml-1 rounded-md p-1.5 text-xl leading-none hover:bg-slate-800"
            aria-label="開啟選單"
          >
            ☰
          </button>
          <span className="text-sm font-black">HH 管理後台</span>
          <span className="ml-auto rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
            {activeLabel}
          </span>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl p-3 md:p-6">
            {active === "overview" && <DashboardView />}
            {active === "players" && <PlayersView />}
            {active === "spirits" && <SpiritsView />}
            {active === "centres" && <CentresView />}
            {active === "missions" && <MissionsView />}
            {active === "notifications" && <NotificationsView />}
            {active === "ops" && <OpsView />}
            {active === "reports" && <ReportsView />}
            {active === "data" && <DataView />}
            {active === "music" && <MusicAdminView />}
            {active === "admins" && <AdminsView />}
          </div>
        </main>
      </div>
    </div>
  );
}
