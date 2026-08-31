"use client";

// 精靈管理：18 隻精靈的生成開關／權重／備註（DB 覆蓋層，無設定 = 預設啟用）。

import { useEffect, useState, useTransition } from "react";
import { getSpiritConfigs, saveSpiritConfigs } from "@/lib/admin/actions";
import type { SpiritConfigRow } from "@/lib/admin/types";
import { SPECIES } from "@/content/species";
import { ELEMENT_INFO } from "@/content/elements";
import {
  Card,
  Badge,
  Btn,
  Toggle,
  Spinner,
  ErrorBanner,
  OkBanner,
  inputCls,
  tableWrapCls,
  tableCls,
  thCls,
  tdCls,
} from "../ui";

interface Row extends SpiritConfigRow {
  /** 介面用：是否被編輯過（只送變更列） */
  dirty: boolean;
}

/** 稀有度中文 */
const RARITY_ZH: Record<string, string> = {
  basic: "基礎",
  common: "常見",
  rare: "稀有",
  epic: "史詩",
  legendary: "傳說",
};

export default function SpiritsView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    getSpiritConfigs().then(
      (cfg) => {
        if (cancelled) return;
        const cfgMap = new Map(cfg.map((c) => [c.spirit_id, c]));
        // 以 species.ts 全名冊為基準（DB 只存覆蓋）；無 row = 預設啟用、權重 1
        setRows(
          SPECIES.map((sp) => {
            const c = cfgMap.get(sp.id);
            return {
              spirit_id: sp.id,
              active: c ? c.active : true,
              spawn_weight: c ? c.spawn_weight : 1,
              note: c?.note ?? null,
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
    setRows((rs) => rs?.map((r) => (r.spirit_id === id ? { ...r, ...p, dirty: true } : r)) ?? rs);
    setMsg("");
  }

  function save() {
    if (!rows) return;
    const changed = rows
      .filter((r) => r.dirty)
      .map(({ spirit_id, active, spawn_weight, note }) => ({ spirit_id, active, spawn_weight, note }));
    if (changed.length === 0) {
      setErr("沒有變更");
      return;
    }
    startTransition(async () => {
      const res = await saveSpiritConfigs(changed);
      if (res.ok) {
        setErr("");
        setMsg(`已儲存 ${changed.length} 項（地圖生成即時套用，玩家重整地圖生效）`);
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
        <h1 className="text-lg font-black text-slate-900">精靈管理</h1>
        <ErrorBanner message={err} />
        <Spinner />
      </>
    );
  }

  const dirtyCount = rows.filter((r) => r.dirty).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-black text-slate-900">精靈管理</h1>
        <Btn onClick={save} disabled={pending || dirtyCount === 0}>
          {pending ? "儲存中…" : `儲存變更${dirtyCount > 0 ? `（${dirtyCount}）` : ""}`}
        </Btn>
      </div>

      <OkBanner message={msg} />
      <ErrorBanner message={err} />

      <Card title="生成設定（覆蓋層：未儲存過的精靈走預設）">
        <p className="mb-3 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          停用＝該精靈不再於地圖任何據點生成（圖鑑／已捕捉不受影響）。權重＝生成池中的出現倍率
          （1=正常、10=最高、0=等同停用）。設定於玩家下次進入地圖時生效。
        </p>
        <div className={tableWrapCls}>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>精靈</th>
                <th className={thCls}>稀有度</th>
                <th className={thCls}>階段</th>
                <th className={thCls}>生成</th>
                <th className={thCls}>權重</th>
                <th className={thCls}>備註</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sp = SPECIES.find((s) => s.id === r.spirit_id)!;
                const elem = ELEMENT_INFO[sp.element];
                return (
                  <tr key={r.spirit_id} className={r.dirty ? "bg-amber-50/60" : "hover:bg-slate-50"}>
                    <td className={tdCls}>
                      <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-slate-100 align-middle">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/spirits/${sp.id}.webp`}
                          alt=""
                          style={{ width: 24, height: 24, objectFit: "contain" }}
                          draggable={false}
                        />
                      </span>
                      <span className="font-bold">{sp.name.zh}</span>
                      <span className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-black text-white" style={{ backgroundColor: elem.color }}>
                        {elem.name.zh}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <Badge tone={sp.rarity === "basic" ? "gray" : sp.rarity === "common" ? "green" : sp.rarity === "rare" ? "blue" : "purple"}>
                        {RARITY_ZH[sp.rarity] ?? sp.rarity}
                      </Badge>
                    </td>
                    <td className={tdCls}>{sp.stage} 階</td>
                    <td className={tdCls}>
                      <Toggle checked={r.active} onChange={(b) => patch(r.spirit_id, { active: b })} />
                    </td>
                    <td className={tdCls}>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={r.spawn_weight}
                        onChange={(e) => patch(r.spirit_id, { spawn_weight: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
                        className={`${inputCls} w-20`}
                      />
                    </td>
                    <td className={tdCls}>
                      <input
                        value={r.note ?? ""}
                        onChange={(e) => patch(r.spirit_id, { note: e.target.value || null })}
                        placeholder="內部備註"
                        className={`${inputCls} w-40`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
