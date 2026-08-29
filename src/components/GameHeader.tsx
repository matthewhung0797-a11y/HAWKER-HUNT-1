"use client";

import { useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import SpiritIcon from "@/components/SpiritIcon";
import UIIcon from "@/components/UIIcon";

/** 遊戲頂欄：精靈頭像 + 等級徽章 + 金幣/寶石膠囊（跟概念圖風格） */
export default function GameHeader() {
  const t = useTranslations();
  const store = useGameStore();

  return (
    <header
      className="z-30 flex items-center justify-between border-b-[3px] px-3 pb-2"
      style={{
        // 避過 iOS／PWA status bar，唔好同電量／訊號重疊
        paddingTop: "calc(env(safe-area-inset-top) + 8px)",
        borderImage: "linear-gradient(90deg, #8a6437, #e8c860 30%, #e8c860 70%, #8a6437) 1",
        background: "linear-gradient(180deg, #f8efd9 0%, #eedfba 100%)",
        boxShadow: "0 3px 10px rgba(74,44,20,0.22)",
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* 頭像：金雙環 + 首隻精靈 */}
        <div
          className="relative rounded-full p-[3px]"
          style={{
            background: "conic-gradient(#e8c860, #c9a227, #f6e2a2, #c9a227, #e8c860)",
            boxShadow: "0 2px 6px rgba(74,44,20,0.35)",
          }}
        >
          {store.ownedSpirits.length > 0 ? (
            <SpiritIcon speciesId={store.ownedSpirits[0].speciesId} size={42} ring={false} />
          ) : (
            <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-parchment">
              <UIIcon name="person" size={24} />
            </div>
          )}
          {/* 等級小徽章 */}
          <span
            className="absolute -bottom-1 -right-1 rounded-full px-1.5 text-[10px] font-black text-white"
            style={{ background: "#b03a2e", border: "1.5px solid #f6e2a2" }}
          >
            {store.level}
          </span>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-black text-ink">{store.nickname || t("profile.guest")}</div>
          <div className="text-[11px] font-bold text-ink-soft">Lv.{store.level}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 金幣膠囊 */}
        <span
          className="flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-sm font-black text-ink"
          style={{
            background: "linear-gradient(180deg, #efe0bd, #e3d0a8)",
            border: "1.5px solid #c9a227",
            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6), 0 1px 3px rgba(74,44,20,0.2)",
          }}
        >
          <UIIcon name="coin" size={22} />
          {store.coins.toLocaleString()}
        </span>
        {/* 寶石膠囊 */}
        <span
          className="flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-sm font-black text-ink"
          style={{
            background: "linear-gradient(180deg, #efe0bd, #e3d0a8)",
            border: "1.5px solid #3d7fc1",
            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6), 0 1px 3px rgba(74,44,20,0.2)",
          }}
        >
          <UIIcon name="gem" size={22} />
          {store.gems}
        </span>
      </div>
    </header>
  );
}
