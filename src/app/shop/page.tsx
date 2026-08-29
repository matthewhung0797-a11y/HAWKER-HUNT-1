"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import UIIcon from "@/components/UIIcon";

const SHOP_ITEMS = [
  { id: "chopsticks_golden", name: { zh: "金筷子", en: "Golden Chopsticks" }, price: 80, img: "/ui/chopstick-golden.png", desc: { zh: "奢華至極，尊貴象徵", en: "Ultimate luxury, symbol of nobility" } },
  { id: "chopsticks_copper", name: { zh: "銅筷子", en: "Copper Chopsticks" }, price: 30, img: "/ui/chopstick-copper.png", desc: { zh: "精緻質感，略顯氣派", en: "Refined texture, slightly grand" } },
  { id: "chopsticks_silver", name: { zh: "銀筷子", en: "Silver Chopsticks" }, price: 50, img: "/ui/chopstick-silver.png", desc: { zh: "名門選用，百毒不侵", en: "Noble choice, immune to poison" } },
  { id: "chopsticks", name: { zh: "木筷子", en: "Wooden Chopsticks" }, price: 10, img: "/ui/chopstick-wooden.png", desc: { zh: "普通筷子，隨處可見", en: "Common chopsticks, found everywhere" } },
];

export default function ShopPage() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const items = useGameStore((s) => s.items);
  const diamonds = useGameStore((s) => s.gems);

  const buyItem = (itemId: string, price: number) => {
    const currentGems = useGameStore.getState().gems;
    if (currentGems < price) return;
    useGameStore.setState((s) => ({
      gems: currentGems - price,
      items: {
        ...s.items,
        [itemId]: (s.items[itemId] ?? 0) + 1,
      },
    }));
  };

  return (
    <main className="paper-texture min-h-dvh pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b-[3px] bg-parchment/95 backdrop-blur"
        style={{ borderImage: "linear-gradient(90deg, #8a6437, #e8c860 30%, #e8c860 70%, #8a6437) 1" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/ui/shop-icon.png" alt="" style={{ width: 32, height: 32 }} />
            <h1 className="text-xl font-black text-ink">
              {locale === "zh" ? "商城" : "Shop"}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1">
            <span className="text-base">💎</span>
            <span className="font-black text-ink">{diamonds}</span>
          </div>
        </div>
      </div>

      {/* Shop Items */}
      <div className="mx-auto max-w-md px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {SHOP_ITEMS.map((item) => {
            const owned = items[item.id] ?? 0;
            const canAfford = diamonds >= item.price;
            return (
              <div
                key={item.id}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-gold/40 bg-white/60 p-4 shadow-sm"
              >
                <img
                  src={item.img}
                  alt={item.name[locale]}
                  style={{ width: 64, height: 64 }}
                  draggable={false}
                />
                <div className="text-center">
                  <p className="text-sm font-black text-ink">{item.name[locale]}</p>
                  <p className="text-xs font-bold text-ink-soft">{item.desc[locale]}</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-ink-soft">
                  {locale === "zh" ? "持有" : "Owned"}: {owned}
                </div>
                <button
                  onClick={() => buyItem(item.id, item.price)}
                  disabled={!canAfford}
                  className={`w-full rounded-full px-4 py-2 text-sm font-black transition-transform ${
                    canAfford
                      ? "btn-gold active:scale-95"
                      : "cursor-not-allowed bg-gray-300 text-gray-500"
                  }`}
                >
                  💎 {item.price}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
