"use client";

// 數據管理：事件瀏覽（篩選/分頁）＋ 匯出 CSV ＋ 資料清理 ＋ 存檔總覽。

import { useEffect, useState, useTransition } from "react";
import { browseEvents, exportEvents, browseSaves, purgeEvents } from "@/lib/admin/actions";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { EventRow, SaveRow } from "@/lib/admin/types";
import {
  Card,
  Badge,
  Btn,
  Spinner,
  EmptyState,
  ErrorBanner,
  OkBanner,
  Field,
  inputCls,
  Pager,
  tableWrapCls,
  tableCls,
  thCls,
  tdCls,
} from "../ui";

const EVENTS_PAGE = 30;
const SAVES_PAGE = 20;

function fmtDate(iso: string): string {
  return iso ? iso.slice(0, 19).replace("T", " ") : "—";
}

function csvEscape(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return `"${String(s).replaceAll('"', '""')}"`;
}

export default function DataView() {
  // 事件篩選（input / submitted 分開，避免逐鍵觸發查詢）
  const [eventInput, setEventInput] = useState("");
  const [playerInput, setPlayerInput] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [filter, setFilter] = useState({ event: "", playerKey: "", from: "", to: "" });

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);

  const [saves, setSaves] = useState<SaveRow[] | null>(null);
  const [savesTotal, setSavesTotal] = useState(0);
  const [savesPage, setSavesPage] = useState(0);

  const [purgeDays, setPurgeDays] = useState("90");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  // 事件瀏覽（setState 只可以喺 promise callback 內）
  useEffect(() => {
    let cancelled = false;
    browseEvents({ page: eventsPage, event: filter.event, playerKey: filter.playerKey, from: filter.from, to: filter.to }).then(
      (res) => {
        if (cancelled) return;
        setEvents(res.rows);
        setEventsTotal(res.total);
      },
      (e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "載入失敗");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [eventsPage, filter]);

  useEffect(() => {
    let cancelled = false;
    browseSaves(savesPage).then(
      (res) => {
        if (cancelled) return;
        setSaves(res.rows);
        setSavesTotal(res.total);
      },
      () => {
        if (!cancelled) setSaves([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [savesPage]);

  function submitFilter(e: React.FormEvent) {
    e.preventDefault();
    setEventsPage(0);
    setFilter({ event: eventInput.trim(), playerKey: playerInput.trim(), from: fromInput, to: toInput });
  }

  function doExport() {
    startTransition(async () => {
      try {
        const rows = await exportEvents({
          event: filter.event,
          playerKey: filter.playerKey,
          from: filter.from,
          to: filter.to,
        });
        if (rows.length === 0) {
          setMsg("");
          setErr("此篩選沒有資料可匯出");
          return;
        }
        const header = ["id", "ts", "player_key", "event", "props", "app_version", "platform"];
        const lines = [header.join(",")];
        for (const r of rows) {
          lines.push([r.id, r.ts, r.player_key, r.event, csvEscape(r.props), csvEscape(r.app_version), csvEscape(r.platform)].join(","));
        }
        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hawker-hunt-events-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setErr("");
        setMsg(`已匯出 ${rows.length} 筆事件 CSV`);
      } catch (e) {
        setMsg("");
        setErr(e instanceof Error ? e.message : "匯出失敗");
      }
    });
  }

  function doPurge() {
    const days = Number(purgeDays);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      setMsg("");
      setErr("天數需 1–365");
      return;
    }
    if (!window.confirm(`確定永久刪除 ${days} 天前所有事件？此操作不可復原（會記入審計日誌）。`)) return;
    startTransition(async () => {
      const res = await purgeEvents(days);
      if (res.ok) {
        setErr("");
        setMsg(`已刪除 ${res.deleted} 筆舊事件`);
        setEventsPage(0);
        setFilter({ ...filter }); // 觸發重新載入
      } else {
        setMsg("");
        setErr(res.error ?? "清理失敗");
      }
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black text-slate-900">數據管理</h1>

      <OkBanner message={msg} />
      <ErrorBanner message={err} />

      <Card
        title="事件瀏覽器（analytics_events）"
        actions={
          <Btn size="sm" variant="subtle" disabled={pending} onClick={doExport}>
            匯出 CSV（最多 5000 筆）
          </Btn>
        }
      >
        <form onSubmit={submitFilter} className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label="事件">
            <select value={eventInput} onChange={(e) => setEventInput(e.target.value)} className={inputCls}>
              <option value="">全部</option>
              {ANALYTICS_EVENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </Field>
          <Field label="player_key">
            <input value={playerInput} onChange={(e) => setPlayerInput(e.target.value)} className={inputCls} placeholder="完整 UUID" />
          </Field>
          <Field label="起（日期）">
            <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className={inputCls} />
          </Field>
          <Field label="迄（日期）">
            <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} className={inputCls} />
          </Field>
          <Btn type="submit">篩選</Btn>
        </form>

        {!events ? (
          <Spinner />
        ) : events.length === 0 ? (
          <EmptyState label="沒有符合的事件" />
        ) : (
          <>
            <div className={tableWrapCls}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>時間</th>
                    <th className={thCls}>事件</th>
                    <th className={thCls}>player_key</th>
                    <th className={thCls}>props</th>
                    <th className={thCls}>版本</th>
                    <th className={thCls}>平台</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className={`${tdCls} whitespace-nowrap text-xs text-slate-500`}>{fmtDate(r.ts)}</td>
                      <td className={tdCls}>
                        <Badge tone="blue">{r.event}</Badge>
                      </td>
                      <td className={`${tdCls} max-w-32 truncate font-mono text-[11px]`}>{r.player_key}</td>
                      <td className={`${tdCls} max-w-48 truncate font-mono text-[11px] text-slate-500`}>
                        {r.props && Object.keys(r.props).length > 0 ? JSON.stringify(r.props) : "—"}
                      </td>
                      <td className={tdCls}>{r.app_version ?? "—"}</td>
                      <td className={tdCls}>{r.platform ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={eventsPage} total={eventsTotal} pageSize={EVENTS_PAGE} onPage={setEventsPage} />
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="存檔總覽（player_saves）">
          {!saves ? (
            <Spinner />
          ) : saves.length === 0 ? (
            <EmptyState label="沒有雲存檔玩家" />
          ) : (
            <>
              <div className={tableWrapCls}>
                <table className={`${tableCls} min-w-[420px]`}>
                  <thead>
                    <tr>
                      <th className={thCls}>暱稱</th>
                      <th className={thCls}>等級</th>
                      <th className={thCls}>金幣</th>
                      <th className={thCls}>精靈</th>
                      <th className={thCls}>更新</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saves.map((r) => (
                      <tr key={r.user_id} className="hover:bg-slate-50">
                        <td className={`${tdCls} max-w-32 truncate font-bold`}>{r.nickname}</td>
                        <td className={tdCls}>Lv.{r.level}</td>
                        <td className={tdCls}>{r.coins.toLocaleString()}</td>
                        <td className={tdCls}>{r.spirit_count}</td>
                        <td className={`${tdCls} whitespace-nowrap text-xs text-slate-500`}>{fmtDate(r.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={savesPage} total={savesTotal} pageSize={SAVES_PAGE} onPage={setSavesPage} />
            </>
          )}
        </Card>

        <Card title="資料清理">
          <div className="space-y-3">
            <Field label="刪除幾天前的事件？" hint="常用：90（保留近 3 個月）。操作會記入審計日誌。">
              <input type="number" min={1} max={365} value={purgeDays} onChange={(e) => setPurgeDays(e.target.value)} className={`${inputCls} w-32`} />
            </Field>
            <Btn variant="danger" disabled={pending} onClick={doPurge}>
              {pending ? "清理中…" : "清理舊事件"}
            </Btn>
            <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              只清 analytics_events（埋點原始資料）；玩家存檔、禮包、審計日誌不受影響。
              報表／留存計算基於事件，清理後舊區間數據不再顯示。
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
