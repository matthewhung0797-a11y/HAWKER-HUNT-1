"use client";

// 玩家管理：搜尋（暱稱模糊 / player_key / user_id）+ 分頁表格 + 詳情抽屜
// （存檔摘要、Email、近期事件、封禁控制、直接發禮包）。

import { useCallback, useEffect, useState, useTransition } from "react";import {
  searchPlayers,
  getPlayerDetail,
  setPlayerBan,
  grantGift,
  listGrantablePacks,
} from "@/lib/admin/actions";
import type { PlayerDetail, PlayerRow } from "@/lib/admin/types";
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

const PAGE_SIZE = 20;

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export default function PlayersView() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [by, setBy] = useState<"nickname" | "player_key" | "user_id">("nickname");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** 封禁／發放後 bump 一下重新拉列表 */
  const [tick, setTick] = useState(0);

  // 詳情抽屜
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 封禁表單
  const [banReason, setBanReason] = useState("");
  const [banDays, setBanDays] = useState("");
  const [msg, setMsg] = useState("");
  const [msgError, setMsgError] = useState("");

  // 發禮包
  const [packs, setPacks] = useState<{ id: string; title: string }[]>([]);
  const [packId, setPackId] = useState("");
  const [pending, startTransition] = useTransition();

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    searchPlayers(query, by, page).then(
      (res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
        setError("");
        setLoading(false);
      },
      (e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "搜尋失敗");
          setLoading(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [query, by, page, tick]);

  useEffect(() => {
    // 發禮包下拉清單（無權限時 graceful 空）
    let cancelled = false;
    listGrantablePacks().then(
      (p) => {
        if (!cancelled) setPacks(p);
      },
      () => {
        if (!cancelled) setPacks([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const openDetail = useCallback((userId: string) => {
    setSelectedId(userId);
    setDetail(null);
    setDetailLoading(true);
    setMsg("");
    setMsgError("");
    getPlayerDetail(userId)
      .then((d) => setDetail(d))
      .catch((e) => setMsgError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setDetailLoading(false));
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setQuery(input);
    setPage(0);
  }

  function doBan(banned: boolean) {
    if (!selectedId) return;
    startTransition(async () => {
      const res = await setPlayerBan(selectedId, banned, banReason, banDays ? Number(banDays) : undefined);
      if (res.ok) {
        setMsg(banned ? "已封禁" : "已解封");
        setMsgError("");
        openDetail(selectedId); // 重新載入旗標
        setTick((t) => t + 1);
      } else {
        setMsg("");
        setMsgError(res.error ?? "操作失敗");
      }
    });
  }

  function doGrant() {
    if (!selectedId || !packId) return;
    startTransition(async () => {
      const res = await grantGift(packId, { userId: selectedId });
      if (res.ok) {
        setMsg(`已發放禮包（${res.granted} 份）`);
        setMsgError("");
      } else {
        setMsg("");
        setMsgError(res.error ?? "發放失敗");
      }
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black text-slate-900">玩家管理</h1>

      <Card>
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:min-w-0 sm:flex-1">
            <Field label="搜尋">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="暱稱（模糊）/ player_key / user_id（完整）"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex flex-1 gap-2 sm:flex-none">
            <select
              value={by}
              onChange={(e) => setBy(e.target.value as typeof by)}
              className={`${inputCls} flex-1 sm:w-36`}
            >
              <option value="nickname">暱稱（模糊）</option>
              <option value="player_key">player_key</option>
              <option value="user_id">user_id</option>
            </select>
            <Btn type="submit" disabled={loading}>
              搜尋
            </Btn>
          </div>
        </form>
      </Card>

      <ErrorBanner message={error} />

      <Card title={`玩家列表（共 ${total} 人）`}>
        {loading && rows.length === 0 ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState label="沒有符合的玩家" />
        ) : (
          <>
            <div className={tableWrapCls}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>暱稱</th>
                    <th className={thCls}>等級</th>
                    <th className={thCls}>金幣</th>
                    <th className={thCls}>精靈</th>
                    <th className={thCls}>最後更新</th>
                    <th className={thCls}>狀態</th>
                    <th className={thCls} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id} className="hover:bg-slate-50">
                      <td className={`${tdCls} max-w-40 truncate font-bold`}>{r.nickname}</td>
                      <td className={tdCls}>Lv.{r.level}</td>
                      <td className={tdCls}>{r.coins.toLocaleString()}</td>
                      <td className={tdCls}>{r.spirit_count}</td>
                      <td className={tdCls}>{fmtDate(r.updated_at)}</td>
                      <td className={tdCls}>
                        {r.banned ? <Badge tone="red">已封禁</Badge> : <Badge tone="green">正常</Badge>}
                      </td>
                      <td className={tdCls}>
                        <Btn variant="ghost" size="sm" onClick={() => openDetail(r.user_id)}>
                          詳情
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </Card>

      {/* ── 詳情抽屜 ── */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSelectedId(null)} aria-hidden />
          <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
            <header className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <h3 className="text-sm font-bold text-slate-800">玩家詳情</h3>
              <button
                onClick={() => setSelectedId(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="關閉"
              >
                ✕
              </button>
            </header>

            <div className="space-y-4 p-4">
              {detailLoading && !detail ? (
                <Spinner />
              ) : !detail ? (
                <EmptyState label="找不到玩家" />
              ) : (
                <>
                  <OkBanner message={msg} />
                  <ErrorBanner message={msgError} />

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Info label="暱稱" value={detail.save.nickname} />
                    <Info label="Email" value={detail.email ?? "—"} />
                    <Info label="user_id" value={detail.save.user_id.slice(0, 8) + "…"} />
                    <Info label="player_key" value={detail.save.player_key ? detail.save.player_key.slice(0, 8) + "…" : "—"} />
                    <Info label="等級" value={`Lv.${detail.save.level}`} />
                    <Info label="金幣" value={detail.save.coins.toLocaleString()} />
                    <Info label="寶石" value={String(detail.summary.gems)} />
                    <Info label="精靈" value={`${detail.save.spirit_count} 隻`} />
                    <Info label="閃光精靈" value={`${detail.summary.shinyCount} 隻`} />
                    <Info label="總捕捉" value={String(detail.summary.totalCaptures)} />
                    <Info label="打卡" value={`${detail.summary.checkinCount} 次`} />
                    <Info label="切磋勝場" value={String(detail.summary.battleWins)} />
                    <Info label="木筷" value={String(detail.summary.chopsticks)} />
                    <Info label="註冊" value={fmtDate(detail.save.created_at)} />
                  </div>

                  {detail.flags?.banned && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      <b>已封禁</b>
                      {detail.flags.reason ? `：${detail.flags.reason}` : ""}
                      {detail.flags.banned_until ? `（至 ${fmtDate(detail.flags.banned_until)}）` : "（永久）"}
                    </div>
                  )}

                  {/* 封禁控制（players:write；無權限會在 server 擋） */}
                  <Card title="封禁控制">
                    <div className="space-y-3">
                      <Field label="原因">
                        <input
                          value={banReason}
                          onChange={(e) => setBanReason(e.target.value)}
                          placeholder="例如：作弊 / 濫用"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="天數（留空 = 永久）">
                        <input
                          type="number"
                          min={1}
                          value={banDays}
                          onChange={(e) => setBanDays(e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <div className="flex gap-2">
                        <Btn variant="danger" size="sm" disabled={pending} onClick={() => doBan(true)}>
                          封禁
                        </Btn>
                        {detail.flags?.banned && (
                          <Btn variant="subtle" size="sm" disabled={pending} onClick={() => doBan(false)}>
                            解除封禁
                          </Btn>
                        )}
                      </div>
                    </div>
                  </Card>

                  {/* 發禮包（players:gift） */}
                  {packs.length > 0 && (
                    <Card title="發放禮包">
                      <div className="space-y-2">
                        <Field label="禮包">
                          <select value={packId} onChange={(e) => setPackId(e.target.value)} className={inputCls}>
                            <option value="">選擇禮包…</option>
                            {packs.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Btn size="sm" disabled={!packId || pending} onClick={doGrant}>
                          發放（進入玩家信箱）
                        </Btn>
                      </div>
                    </Card>
                  )}

                  {/* 近期事件 */}
                  <Card title="近期事件（近 20 筆）">
                    {detail.events.length === 0 ? (
                      <EmptyState label="無埋點記錄（可能從未觸發事件或 Supabase 未通電）" />
                    ) : (
                      <ul className="space-y-1.5 text-xs">
                        {detail.events.map((e, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-slate-400">{fmtDate(e.ts)}</span>
                            <Badge tone="blue">{e.event}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-slate-400">{label}</div>
      <div className="truncate font-bold text-slate-800" title={value}>
        {value}
      </div>
    </div>
  );
}
