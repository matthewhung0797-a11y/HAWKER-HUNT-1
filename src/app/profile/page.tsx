"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { SPECIES, SPECIES_MAP } from "@/content/species";
import { FACTION_MAP } from "@/content/centres";
import { ITEM_MAP } from "@/content/items";
import { ELEMENT_INFO } from "@/content/elements";
import { BADGES, type BadgeDef } from "@/content/badges";
import { useGameStore, spiritExpToNext, SPIRIT_LEVEL_CAP } from "@/lib/store";
import { validateNickname, nicknameErrorText } from "@/lib/nickname";
import { sfxTap } from "@/lib/sfx";
import BottomNav from "@/components/BottomNav";
import LangSwitch from "@/components/LangSwitch";
import SpiritIcon from "@/components/SpiritIcon";
import AccountCard from "@/components/AccountCard";
import GiftBox from "@/components/GiftBox";
import UIIcon from "@/components/UIIcon";

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const store = useGameStore();
  const [selectedBadge, setSelectedBadge] = useState<BadgeDef | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  // 名稱即時驗證（敏感字／格式）；顯示中譯/英譯錯誤提示，違規時確認鈕鎖住
  const nameErrorCode = editingName ? validateNickname(nameInput) : null;
  const nameError = nameErrorCode ? nicknameErrorText(nameErrorCode, locale) : "";

  const caughtCount = Object.keys(store.captureCounts).length;
  const dexPercent = Math.round((caughtCount / SPECIES.length) * 100);
  const faction = FACTION_MAP[store.factionId];
  const expNeeded = 100 * store.level;

  // 精靈展示排序：閃光 → 高階 → 高等
  const sortedSpirits = useMemo(
    () =>
      [...store.ownedSpirits].sort(
        (a, b) =>
          Number(b.shiny ?? false) - Number(a.shiny ?? false) ||
          (SPECIES_MAP[b.speciesId]?.stage ?? 0) - (SPECIES_MAP[a.speciesId]?.stage ?? 0) ||
          b.level - a.level
      ),
    [store.ownedSpirits]
  );

  const stats = [
    { label: t("profile.totalCaught"), value: store.ownedSpirits.length, icon: "chopsticks" },
    { label: t("profile.dexCompletion"), value: `${dexPercent}%`, icon: "book" },
    { label: t("profile.totalCheckins"), value: store.checkins.length, icon: "lantern" },
    { label: t("profile.level"), value: `Lv.${store.level}`, icon: "star" },
  ];

  function resetData() {
    if (confirm(locale === "zh" ? "確定重設所有遊戲數據？" : "Reset all game data?")) {
      store.resetAll();
      router.push("/");
    }
  }

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      {/* 個人資料區 */}
      <header className="card-parchment mx-4 mt-6 flex items-center gap-4 rounded-2xl p-5">
        {store.ownedSpirits.length > 0 ? (
          <SpiritIcon speciesId={store.ownedSpirits[0].speciesId} size={64} />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-gold bg-parchment">
            <UIIcon name="person" size={36} />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-ink">{store.nickname || t("profile.guest")}</h1>
            <button
              onClick={() => {
                sfxTap();
                setNameInput(store.nickname || "");
                setEditingName(true);
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/20 bg-parchment-dark/60 text-xs text-ink-soft transition active:scale-90 hover:bg-parchment-dark"
              aria-label={t("profile.changeName")}
              title={t("profile.changeName")}
            >
              ✏️
            </button>
            {faction && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: faction.color }}
              >
                {faction.name[locale]}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs font-bold text-ink-soft">
            Lv.{store.level} · {t("profile.exp")} {store.exp}/{expNeeded}
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-parchment-dark">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light"
              style={{ width: `${Math.min(100, (store.exp / expNeeded) * 100)}%` }}
            />
          </div>
        </div>
      </header>

      {/* 數據統計 */}
      <section className="mx-4 mt-4 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card-parchment flex flex-col items-center gap-1 p-4">
            <UIIcon name={s.icon} size={34} />
            <span className="text-xl font-black text-ink">{s.value}</span>
            <span className="text-xs text-ink-soft">{s.label}</span>
          </div>
        ))}
      </section>

      {/* 我的精靈 */}
      <section className="mx-4 mt-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink">
          <UIIcon name="chopsticks" size={18} /> {t("profile.mySpirits")}
        </h2>
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-2 pt-1">
          {sortedSpirits.length === 0 ? (
            <div className="card-parchment w-full p-6 text-center text-xs text-ink-soft">
              {t("dex.uncaught")}
            </div>
          ) : (
            sortedSpirits.map((sp) => {
              const species = SPECIES_MAP[sp.speciesId];
              if (!species) return null;
              const elem = ELEMENT_INFO[species.element];
              return (
                <Link
                  key={sp.uid}
                  href={`/dex/${sp.speciesId}`}
                  className={`card-parchment relative flex h-[140px] w-[92px] shrink-0 flex-col items-center gap-1 overflow-hidden p-2.5 pt-3 ${
                    sp.shiny ? "ring-2 ring-gold shadow-[0_0_14px_rgba(232,200,96,0.65)]" : ""
                  }`}
                >
                  {sp.shiny && (
                    <span className="shiny-badge absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-ink">
                      ✦
                    </span>
                  )}
                  <SpiritIcon speciesId={sp.speciesId} size={58} />
                  <span className="w-full truncate text-center text-[11px] font-black leading-tight text-ink">
                    {species.name[locale]}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="rounded-full bg-ink px-1.5 py-px text-[9px] font-black text-parchment-light">
                      Lv.{sp.level}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-px text-[9px] font-black text-white"
                      style={{ backgroundColor: elem.color }}
                    >
                      {elem.name[locale]}
                    </span>
                  </span>
                  {/* 精靈經驗條（切磋贏取；到頂升級） */}
                  <span className="h-1 w-full overflow-hidden rounded-full bg-parchment-dark">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-gold to-gold-light"
                      style={{
                        width: `${
                          sp.level >= SPIRIT_LEVEL_CAP
                            ? 100
                            : Math.min(100, ((sp.exp ?? 0) / spiritExpToNext(sp.level)) * 100)
                        }%`,
                      }}
                    />
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </section>

      {/* 我的道具（進化素材） */}
      <section className="mx-4 mt-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink">
          <UIIcon name="backpack" size={18} /> {t("profile.myItems")}
        </h2>
        <div className="card-parchment flex flex-wrap gap-2 p-4">
          {(() => {
            // 只顯示現有精靈的進化素材
            const relevantItemIds = new Set<string>();
            for (const sp of store.ownedSpirits) {
              const species = SPECIES_MAP[sp.speciesId];
              if (species?.evolutionRequirement?.items) {
                for (const itemId of Object.keys(species.evolutionRequirement.items)) {
                  relevantItemIds.add(itemId);
                }
              }
            }
            const materials = Object.entries(store.items)
              .filter(([itemId, q]) => q > 0 && !itemId.includes("chopstick") && relevantItemIds.has(itemId));
            if (materials.length === 0) {
              return <span className="text-xs text-ink-soft">—</span>;
            }
            return materials.map(([itemId, qty]) => (
              <div key={itemId} className="flex items-center gap-1 rounded-full bg-parchment-dark/60 px-3 py-1 text-sm font-bold text-ink">
                <UIIcon name={ITEM_MAP[itemId]?.icon ?? "item-scroll"} size={18} />
                <span className="text-xs">{ITEM_MAP[itemId]?.name?.[locale] ?? itemId}</span>
                <span className="text-xs text-gold">×{qty}</span>
              </div>
            ));
          })()}
        </div>
      </section>

      {/* 筷子庫存 */}
      <section className="mx-4 mt-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink">
          <UIIcon name="chopsticks" size={18} /> 筷子庫存
        </h2>
        <div className="card-parchment grid grid-cols-4 gap-2 p-4">
          {[
            { id: "wooden", name: { en: "Wooden", zh: "木筷" }, key: "chopsticks" },
            { id: "copper", name: { en: "Copper", zh: "銅筷" }, key: "chopsticks_copper" },
            { id: "silver", name: { en: "Silver", zh: "銀筷" }, key: "chopsticks_silver" },
            { id: "golden", name: { en: "Golden", zh: "金筷" }, key: "chopsticks_golden" },
          ].map((tier) => {
            const count = store.items[tier.key] ?? 0;
            return (
              <div key={tier.id} className="flex flex-col items-center gap-1 rounded-xl bg-parchment-dark/60 p-2">
                <img src={`/ui/chopstick-${tier.id}.png`} alt={tier.name[locale]} style={{ width: 40, height: 40 }} draggable={false} />
                <span className="text-[11px] font-black text-ink">{tier.name[locale]}</span>
                <span className="text-sm font-black text-gold">×{count}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 禮包（兌換碼 + 待領信箱） */}
      <GiftBox />

      {/* 徽章牆 */}
      <section className="mx-4 mt-4">
        <h2 className="mb-2 flex items-center justify-between text-sm font-black text-ink">
          <span className="flex items-center gap-1.5">
            <UIIcon name="medal" size={18} /> {t("profile.badges")}
          </span>
          <span className="text-xs font-bold text-ink-soft">
            {BADGES.filter((b) => !b.hidden && b.progress(store) >= b.target).length}/
            {BADGES.filter((b) => !b.hidden).length}
          </span>
        </h2>
        <div className="card-parchment grid grid-cols-4 gap-3 p-4">
          {BADGES.filter((b) => !b.hidden).map((badge) => {
            const cur = badge.progress(store);
            const unlocked = cur >= badge.target;
            return (
              <button
                key={badge.id}
                onClick={() => {
                  sfxTap();
                  setSelectedBadge(badge);
                }}
                className="flex flex-col items-center gap-1"
                aria-label={badge.name[locale]}
              >
                <span
                  className={`flex aspect-square w-full max-w-[64px] items-center justify-center rounded-full border-2 ${
                    unlocked
                      ? "badge-unlocked border-gold bg-gold/25"
                      : "border-ink-soft/30 bg-parchment-dark/40"
                  }`}
                >
                  <UIIcon name={badge.icon} size={30} dimmed={!unlocked} />
                </span>
                <span
                  className={`w-full truncate text-center text-[10px] font-bold leading-tight ${
                    unlocked ? "text-ink" : "text-ink-soft/70"
                  }`}
                >
                  {badge.name[locale]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 修改名稱 modal */}
      {editingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6" onClick={() => setEditingName(false)}>
          <div
            className="card-parchment w-full max-w-sm rounded-2xl border-2 border-gold/50 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-center text-base font-black text-ink">{t("profile.changeName")}</h3>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value.slice(0, 12))}
              maxLength={12}
              autoFocus
              placeholder={t("profile.namePlaceholder")}
              className="w-full rounded-xl border-2 border-ink/15 bg-parchment-dark/40 px-3 py-2.5 text-center text-base font-bold text-ink outline-none placeholder:text-ink-soft/50 focus:border-gold"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              {nameError ? (
                <span className="text-[11px] font-bold text-chilli">{nameError}</span>
              ) : (
                <span />
              )}
              <span className="shrink-0 text-[11px] font-bold text-ink-soft">{nameInput.length}/12</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setEditingName(false)}
                className="flex-1 rounded-xl bg-parchment-dark/60 py-2.5 text-sm font-bold text-ink-soft transition active:scale-95"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  const trimmed = nameInput.trim();
                  if (validateNickname(trimmed)) return; // 驗證不過（提示已即時顯示）
                  store.setNickname(trimmed);
                  setEditingName(false);
                }}
                disabled={Boolean(validateNickname(nameInput))}
                className="btn-gold flex-1 py-2.5 text-sm font-black disabled:opacity-50"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 徽章詳情 bottom sheet */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/45"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="slide-up mx-auto w-full max-w-md rounded-t-3xl card-parchment border-b-0 p-6 pb-10"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const cur = selectedBadge.progress(store);
              const unlocked = cur >= selectedBadge.target;
              const pct = Math.min(100, (cur / selectedBadge.target) * 100);
              return (
                <div className="flex flex-col items-center gap-3 text-center">
                  <span
                    className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${
                      unlocked ? "badge-unlocked border-gold bg-gold/25" : "border-ink-soft/30 bg-parchment-dark/40"
                    }`}
                  >
                    <UIIcon name={selectedBadge.icon} size={44} dimmed={!unlocked} />
                  </span>
                  <div>
                    <h3 className="text-lg font-black text-ink">{selectedBadge.name[locale]}</h3>
                    <span
                      className={`mt-1 inline-block rounded-full px-3 py-0.5 text-[11px] font-black ${
                        unlocked ? "bg-gold text-ink" : "bg-parchment-dark text-ink-soft"
                      }`}
                    >
                      {unlocked ? `✔ ${t("profile.badgeUnlocked")}` : t("profile.badgeLocked")}
                    </span>
                  </div>
                  <p className="text-sm text-ink-soft">{selectedBadge.description[locale]}</p>
                  <div className="w-full max-w-xs">
                    <div className="relative h-5 overflow-hidden rounded-full border-2 border-ink/60 bg-parchment-dark">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-ink">
                        {Math.min(cur, selectedBadge.target)}/{selectedBadge.target}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-ink-soft">
                      {t("profile.badgeProgress")}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedBadge(null)}
                    className="btn-gold mt-1 px-10 py-2.5 text-base font-black"
                  >
                    {t("common.close")}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 設定 */}
      <section className="mx-4 mt-4 flex flex-col gap-2">
        <h2 className="mb-0.5 flex items-center gap-1.5 text-sm font-black text-ink">
          <UIIcon name="person" size={18} /> {t("account.title")}
        </h2>
        <AccountCard />
        <div className="card-parchment flex items-center justify-between p-4">
          <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <UIIcon name="globe" size={18} /> {t("profile.languageSetting")}
          </span>
          <LangSwitch />
        </div>
        {store.devMode && (
          <button
            onClick={() => {
              store.devUnlockAll();
            }}
            className="card-parchment flex items-center gap-1.5 p-4 text-left text-sm font-bold text-pandan"
          >
            <UIIcon name="sparkles" size={18} /> 解鎖全部精靈＋道具（測試進化形態）
          </button>
        )}
        <div className="card-parchment flex items-center justify-between p-4">
          <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <UIIcon name="wrench" size={18} /> Dev Mode
          </span>
          <button
            onClick={store.toggleDevMode}
            className={`h-7 w-12 rounded-full border-2 transition-colors ${
              store.devMode ? "border-pandan bg-pandan" : "border-ink-soft/40 bg-parchment-dark"
            }`}
            aria-label="Toggle dev mode"
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                store.devMode ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <button
          onClick={resetData}
          className="card-parchment flex items-center gap-1.5 p-4 text-left text-sm font-bold text-chilli"
        >
          <UIIcon name="trash" size={18} /> {t("profile.resetData")}
        </button>
      </section>

      <BottomNav />
    </main>
  );
}
