"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import UIIcon from "@/components/UIIcon";

const TABS = [
  { href: "/shop", key: "shop", icon: "/ui/shop-icon.png", type: "img" },
  { href: "/my-spirits", key: "mySpirits", icon: "/ui/my-spirits-icon.png", type: "img" },
  { href: "/map", key: "map", icon: "nav-map", type: "ui" },
  { href: "/dex", key: "dex", icon: "book", type: "ui" },
  { href: "/leaderboard", key: "leaderboard", icon: "trophy", type: "ui" },
  { href: "/profile", key: "profile", icon: "person", type: "ui" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="relative border-t-[3px]"
        style={{
          borderImage: "linear-gradient(90deg, #8a6437, #e8c860 30%, #e8c860 70%, #8a6437) 1",
          background: "linear-gradient(180deg, #f6ecd2 0%, #ecdcb4 60%, #dfc898 100%)",
          boxShadow: "0 -4px 14px rgba(74,44,20,0.25)",
        }}
      >
        <div className="mx-auto flex max-w-md items-end justify-around px-1">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-1 px-2 pb-2 pt-2.5 transition-transform ${
                  active ? "text-chilli" : "text-ink-soft/80"
                }`}
              >
                {tab.type === "img" ? (
                  <img
                    src={tab.icon}
                    alt={t(tab.key)}
                    className={active ? "scale-110 drop-shadow-[0_2px_2px_rgba(176,58,46,0.35)] transition-transform" : "transition-transform opacity-80"}
                    style={{ width: 26, height: 26 }}
                  />
                ) : (
                  <UIIcon
                    name={tab.icon}
                    size={26}
                    dimmed={!active}
                    className={active ? "scale-110 drop-shadow-[0_2px_2px_rgba(176,58,46,0.35)] transition-transform" : "transition-transform"}
                  />
                )}
                <span className={`text-[11px] leading-none ${active ? "font-black" : "font-bold"}`}>
                  {t(tab.key)}
                </span>
                {active && <span className="h-1 w-6 rounded-full bg-chilli" />}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
