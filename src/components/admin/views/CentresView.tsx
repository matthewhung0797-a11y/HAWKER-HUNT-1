"use client";

// 據點管理：7 個據點的顯示開關 + spawnPool 覆蓋（DB 覆蓋層，未儲存 = 用 code 預設池）。

import { useEffect, useState, useTransition } from "react";
import { getCentreConfigs, saveCentreConfigs } from "@/lib/admin/actions";
import type { CentreConfigRow } from "@/lib/admin/types";
import { HAWKER_CENTRES } from "@/content/centres";
import { SPECIES, SPECIES_MAP } from "@/content/species";
import {
  Card,
  Badge,
  Btn,
  Toggle,
  Spinner,
  ErrorBanner,
  OkBanner,
  Field,
  inputCls,
} from "../ui";

interface Row extends CentreConfigRow {
  dirty: boolean;
}

/** 可選池：一階精靈（spawnPool 慣例只放一階；基礎原料層自動併入） */
const POOL_OPTIONS = SPECIES.filter((sp) => sp.stage === 1);

export default function CentresView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    getCentreConfigs().then(
      (cfg) => {
        if (cancelled) return;
        const cfgMap = new Map(cfg.map((c) => [c.centre_id, c]));
        setRows(
          HAWKER_CENTRES.map((c) => {
            const conf = cfgMap.get(c.id);
            return {
              centre_id: c.id,
              active: conf ? conf.active : true,
              spawn_pool: conf?.spawn_pool ?? null, // null = 用預設
              note: conf?.note ?? null,
              dirty: false,
            };
          })
        );
      },
      (e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "載入失敗");
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(id: string, p: Partial<Row>) {
    setRows((rs) => rs?.map((r) => (r.centre_id === id ? { ...r, ...p, dirty: true } : r)) ?? rs);
    setMsg("");
  }

  /** 勾／取消池內一隻精靈（未自訂過就以 code 預設池為起點） */
  function togglePoolItem(row: Row, speciesId: string) {
    const base = row.spawn_pool ?? (HAWKER_CENTRES.find((c) => c.id === row.centre_id)?.spawnPool ?? []);
    const next = base.includes(speciesId)
      ? base.filter((s) => s !== speciesId)
      : [...base, speciesId];
    patch(row.centre_id, { spawn_pool: next });
  }

  /** 清空覆蓋 → 回到 code 預設池 */
  function resetPool(row: Row) {
    patch(row.centre_id, { spawn_pool: null });
  }

  function save() {
    if (!rows) return;
    const changed = rows
      .filter((r) => r.dirty)
      .map(({ centre_id, active, spawn_pool, note }) => ({ centre_id, active, spawn_pool, note }));
    if (changed.length === 0) {
      setErr("沒有變更");
      return;
    }
    startTransition(async () => {
      const res = await saveCentreConfigs(changed);
      if (res.ok) {
        setErr("");
        setMsg(`已儲存 ${changed.length} 個據點（玩家重整地圖生效）`);
        setRows((rs) => rs?.map((r) => ({ ...r, dirty: false })) ?? rs);
      } else {
        setMsg("");
        setErr(res.error ?? "儲存失敗");
      }
    });
  }

  if (!rows) {
    return (
      <>
        <h1 className="text-lg font-black text-slate-900">據點管理</h1>
        <ErrorBanner message={err} />
        <Spinner />
      </>
    );
  }

  const dirtyCount = rows.filter((r) => r.dirty).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-black text-slate-900">據點管理</h1>
        <Btn onClick={save} disabled={pending || dirtyCount === 0}>
          {pending ? "儲存中…" : `儲存變更${dirtyCount > 0 ? `（${dirtyCount}）` : ""}`}
        </Btn>
      </div>

      <OkBanner message={msg} />
      <ErrorBanner message={err} />

      <p className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500 shadow-sm">
        停用＝地圖隱藏該據點（marker、生成、打卡入口一併消失）。生成池覆蓋＝該據點一階精靈自訂
        （基礎原料層不受控、自動併入；打卡後二階跟隨池內一階的進化）。GPS／QR 綁定不變。
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => {
          const centre = HAWKER_CENTRES.find((c) => c.id === row.centre_id)!;
          const effectivePool = row.spawn_pool ?? centre.spawnPool;
          return (
            <Card
              key={row.centre_id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {centre.name.zh}
                  {row.dirty ? <Badge tone="amber">未儲存</Badge> : null}
                </span>
              }
              actions={
                <Toggle checked={row.active} onChange={(b) => patch(row.centre_id, { active: b })} label={row.active ? "啟用" : "停用"} />
              }
              className={row.active ? "" : "opacity-60"}
            >
              <div className="mb-3 space-y-1 text-xs text-slate-500">
                <div>
                  {centre.district.zh}・GPS {centre.lat.toFixed(5)}, {centre.lng.toFixed(5)}
                </div>
                <div>
                  代表精靈：
                  {SPECIES_MAP[centre.featuredSpeciesId]?.name.zh ?? centre.featuredSpeciesId}・每日打卡上限 {centre.dailyCheckinLimit} 次
                </div>
              </div>

              <Field label="生成池（一階）">
                <div className="flex flex-wrap gap-1.5">
                  {POOL_OPTIONS.map((sp) => {
                    const on = effectivePool.includes(sp.id);
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => togglePoolItem(row, sp.id)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                          on
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {sp.name.zh}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="備註">
                    <input
                      value={row.note ?? ""}
                      onChange={(e) => patch(row.centre_id, { note: e.target.value || null })}
                      placeholder="內部備註"
                      className={inputCls}
                    />
                  </Field>
                </div>
                {row.spawn_pool !== null && (
                  <Btn variant="ghost" size="sm" onClick={() => resetPool(row)}>
                    還原預設池
                  </Btn>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
