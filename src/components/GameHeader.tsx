"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import { SPECIES_MAP } from "@/content/species";
import SpiritIcon from "@/components/SpiritIcon";
import UIIcon from "@/components/UIIcon";

/** 遊戲頂欄：精靈頭像 + 等級徽章 + 金幣/寶石膠囊 */
export default function GameHeader() {
  const t = useTranslations();
  const store = useGameStore();
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const avatarId = store.avatarSpeciesId ?? store.ownedSpirits[0]?.speciesId ?? null;

  return (
    <>
      <header
        className="z-30 flex items-center justify-between border-b-[3px] px-3 pb-2"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 8px)",
          borderImage: "linear-gradient(90deg, #8a6437, #e8c860 30%, #e8c860 70%, #8a6437) 1",
          background: "linear-gradient(180deg, #f8efd9 0%, #eedfba 100%)",
          boxShadow: "0 3px 10px rgba(74,44,20,0.22)",
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* 頭像按鈕：點擊打開選擇器 */}
          <button
            onClick={() => setAvatarPickerOpen(true)}
            className="relative rounded-full p-[3px] active:scale-95 transition-transform"
            style={{
              background: "conic-gradient(#e8c860, #c9a227, #f6e2a2, #c9a227, #e8c860)",
              boxShadow: "0 2px 6px rgba(74,44,20,0.35)",
            }}
            aria-label="Change avatar"
          >
            {avatarId ? (
              <SpiritIcon speciesId={avatarId} size={42} ring={false} />
            ) : (
              <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-parchment">
                <UIIcon name="person" size={24} />
              </div>
            )}
            {/* 等級小徽章 */}
            <span
              className="absolute -bottom-1 -right-1 rounded-full px-1.5 text-[10px] text-white"
              style={{ background: "#b03a2e", border: "1.5px solid #f6e2a2", fontWeight: 400 }}
            >
              {store.level}
            </span>
          </button>
          <div className="leading-tight">
            <div className="text-sm text-ink" style={{ fontWeight: 400 }}>{store.nickname || t("profile.guest")}</div>
            <div className="text-[11px] text-ink-soft" style={{ fontWeight: 400 }}>Lv.{store.level}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-sm text-ink"
            style={{
              background: "linear-gradient(180deg, #efe0bd, #e3d0a8)",
              border: "1.5px solid #c9a227",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6), 0 1px 3px rgba(74,44,20,0.2)",
              fontWeight: 400,
            }}
          >
            <UIIcon name="coin" size={22} />
            {store.coins.toLocaleString()}
          </span>
          <span
            className="flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-sm text-ink"
            style={{
              background: "linear-gradient(180deg, #efe0bd, #e3d0a8)",
              border: "1.5px solid #3d7fc1",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6), 0 1px 3px rgba(74,44,20,0.2)",
              fontWeight: 400,
            }}
          >
            <UIIcon name="gem" size={22} />
            {store.gems}
          </span>
        </div>
      </header>

      {/* 頭像選擇器 */}
      {avatarPickerOpen && (
        <AvatarPicker
          currentId={avatarId}
          onClose={() => setAvatarPickerOpen(false)}
          onSelect={(id) => {
            store.setAvatarSpecies(id);
            setAvatarPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

function AvatarPicker({
  currentId,
  onClose,
  onSelect,
}: {
  currentId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const store = useGameStore();

  // 曾擁有的精靈（ownedSpirits 去重 + captureCounts）
  const ownedSpeciesIds = Array.from(
    new Set([
      ...store.ownedSpirits.map((s) => s.speciesId),
      ...Object.keys(store.captureCounts),
    ])
  ).filter((id) => SPECIES_MAP[id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="card-parchment relative max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg text-ink" style={{ fontWeight: 400 }}>更換頭像</h2>
          <button onClick={onClose} className="text-2xl text-ink-soft" style={{ fontWeight: 400 }}>✕</button>
        </div>

        {ownedSpeciesIds.length === 0 ? (
          <p className="text-center text-sm text-ink-soft py-8">尚未捕捉任何精靈</p>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {ownedSpeciesIds.map((id) => (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className={`flex flex-col items-center gap-1 rounded-xl p-2 transition-transform active:scale-90 ${
                  currentId === id ? "ring-2 ring-gold bg-gold/10" : "bg-white/50"
                }`}
              >
                <SpiritIcon speciesId={id} size={56} ring={false} />
                <span className="text-[10px] text-ink-soft text-center leading-tight" style={{ fontWeight: 400 }}>
                  {SPECIES_MAP[id]?.name.zh ?? id}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
