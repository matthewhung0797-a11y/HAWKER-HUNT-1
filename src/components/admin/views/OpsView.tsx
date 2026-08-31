"use client";

// 營運設定：維護模式（上下架遊戲）/ 版本控制 / 全服公告 / 禮包發放。

import { useEffect, useState, useTransition } from "react";
import {
  getAppConfig,
  updateMaintenance,
  updateVersion,
  listAnnouncements,
  saveAnnouncement,
  setAnnouncementActive,
  deleteAnnouncement,
  listGiftPacks,
  saveGiftPack,
  setGiftPackActive,
  grantGift,
} from "@/lib/admin/actions";
import type { AnnouncementRow, GiftContents, GiftPackRow, MaintenanceConfig, VersionConfig } from "@/lib/admin/types";
import {
  Card,
  Badge,
  Btn,
  Toggle,
  Modal,
  Spinner,
  EmptyState,
  ErrorBanner,
  OkBanner,
  Field,
  inputCls,
} from "../ui";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

/** datetime-local value（HH:MM 無時區）→ ISO；空回 undefined */
function localToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** ISO → datetime-local value */
function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

// ── 維護模式卡 ───────────────────────────────────────

function MaintenanceCard({ config, onSaved }: { config: MaintenanceConfig; onSaved: () => void }) {
  // 父層用 key={…} 令 config 更新時整個 component 重掛，免去 props→state 同步 effect
  const [enabled, setEnabled] = useState(config.enabled);
  const [message, setMessage] = useState(config.message);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateMaintenance(enabled, message);
      if (res.ok) {
        setMsg(enabled ? "已開啟維護模式（遊戲端將顯示維護畫面）" : "已關閉維護模式");
        setErr("");
        onSaved();
      } else {
        setMsg("");
        setErr(res.error ?? "儲存失敗");
      }
    });
  }

  return (
    <Card
      title="維護模式（遊戲上下架）"
      actions={enabled ? <Badge tone="red">維護中</Badge> : <Badge tone="green">運作中</Badge>}
    >
      <OkBanner message={msg} />
      <ErrorBanner message={err} />
      <div className="space-y-3">
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? "開啟（玩家暫時無法進入遊戲）" : "關閉（遊戲正常運作）"} />
        <Field label="維護訊息（顯示給玩家）">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={inputCls} placeholder="系統維護中，預計 30 分鐘後恢復。" />
        </Field>
        <Btn disabled={pending} onClick={save}>
          {pending ? "儲存中…" : "儲存"}
        </Btn>
      </div>
    </Card>
  );
}

// ── 版本控制卡 ───────────────────────────────────────

function VersionCard({ config, onSaved }: { config: VersionConfig; onSaved: () => void }) {
  // 父層用 key={…} 令 config 更新時整個 component 重掛，免去 props→state 同步 effect
  const [v, setV] = useState(config);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateVersion(v);
      if (res.ok) {
        setMsg("版本設定已儲存");
        setErr("");
        onSaved();
      } else {
        setMsg("");
        setErr(res.error ?? "儲存失敗");
      }
    });
  }

  return (
    <Card title="版本控制（強制更新）">
      <OkBanner message={msg} />
      <ErrorBanner message={err} />
      <div className="space-y-3">
        <Field label="最低支援版本" hint="低於此版本的客戶端會被要求更新（需同時開啟強制更新）">
          <input value={v.minVersion} onChange={(e) => setV({ ...v, minVersion: e.target.value })} className={inputCls} placeholder="0.1.0" />
        </Field>
        <Field label="Android 下載連結">
          <input value={v.androidUrl} onChange={(e) => setV({ ...v, androidUrl: e.target.value })} className={inputCls} placeholder="https://…" />
        </Field>
        <Field label="iOS 下載連結">
          <input value={v.iosUrl} onChange={(e) => setV({ ...v, iosUrl: e.target.value })} className={inputCls} placeholder="https://…" />
        </Field>
        <Toggle checked={v.forceUpdate} onChange={(b) => setV({ ...v, forceUpdate: b })} label="啟用強制更新" />
        <Btn disabled={pending} onClick={save}>
          {pending ? "儲存中…" : "儲存"}
        </Btn>
      </div>
    </Card>
  );
}

// ── 公告卡 ───────────────────────────────────────────

interface AnnForm {
  id?: string;
  title: string;
  body: string;
  kind: "popup" | "banner";
  active: boolean;
  starts_at: string;
  ends_at: string;
}

const emptyAnn: AnnForm = { title: "", body: "", kind: "popup", active: true, starts_at: "", ends_at: "" };

function AnnouncementsCard() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AnnForm | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  /** 儲存／上下架／刪除後 bump 重新拉列表 */
  const [tick, setTick] = useState(0);

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    listAnnouncements().then(
      (r) => {
        if (!cancelled) {
          setRows(r);
          setLoading(false);
        }
      },
      () => {
        if (!cancelled) setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);

  function save() {
    if (!editing) return;
    startTransition(async () => {
      const res = await saveAnnouncement({
        id: editing.id,
        title: editing.title,
        body: editing.body,
        kind: editing.kind,
        active: editing.active,
        starts_at: localToIso(editing.starts_at),
        ends_at: localToIso(editing.ends_at),
      });
      if (res.ok) {
        setEditing(null);
        setMsg("公告已儲存");
        setErr("");
        reload();
      } else {
        setMsg("");
        setErr(res.error ?? "儲存失敗");
      }
    });
  }

  function toggle(row: AnnouncementRow) {
    startTransition(async () => {
      await setAnnouncementActive(row.id, !row.active);
      reload();
    });
  }

  function remove(row: AnnouncementRow) {
    if (!window.confirm(`確定刪除公告「${row.title}」？`)) return;
    startTransition(async () => {
      await deleteAnnouncement(row.id);
      reload();
    });
  }

  return (
    <Card
      title="全服公告"
      actions={
        <Btn size="sm" onClick={() => setEditing({ ...emptyAnn })}>
          + 新增
        </Btn>
      }
    >
      <OkBanner message={msg} />
      <ErrorBanner message={err} />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState label="未有公告" />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-800">{r.title}</span>
                    <Badge tone={r.kind === "popup" ? "purple" : "blue"}>{r.kind === "popup" ? "彈窗" : "橫幅"}</Badge>
                    {r.active ? <Badge tone="green">上架</Badge> : <Badge tone="gray">下架</Badge>}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{r.body}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {fmtDate(r.starts_at)} ~ {fmtDate(r.ends_at)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Btn variant="ghost" size="sm" onClick={() => toggle(r)}>
                    {r.active ? "下架" : "上架"}
                  </Btn>
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditing({
                        id: r.id,
                        title: r.title,
                        body: r.body,
                        kind: r.kind,
                        active: r.active,
                        starts_at: isoToLocal(r.starts_at),
                        ends_at: isoToLocal(r.ends_at),
                      })
                    }
                  >
                    編輯
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => remove(r)}>
                    刪除
                  </Btn>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "編輯公告" : "新增公告"}
        footer={
          <>
            <Btn variant="subtle" onClick={() => setEditing(null)}>
              取消
            </Btn>
            <Btn disabled={pending} onClick={save}>
              儲存
            </Btn>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <Field label="標題">
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} />
            </Field>
            <Field label="內容">
              <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={4} className={inputCls} />
            </Field>
            <Field label="類型">
              <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as "popup" | "banner" })} className={inputCls}>
                <option value="popup">彈窗（進遊戲顯示一次）</option>
                <option value="banner">橫幅（頂部可關閉）</option>
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="開始時間（可留空）">
                <input type="datetime-local" value={editing.starts_at} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value })} className={inputCls} />
              </Field>
              <Field label="結束時間（可留空）">
                <input type="datetime-local" value={editing.ends_at} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Toggle checked={editing.active} onChange={(b) => setEditing({ ...editing, active: b })} label="立即上架" />
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ── 禮包卡 ───────────────────────────────────────────

interface PackForm {
  id?: string;
  code: string;
  title: string;
  coins: string;
  gems: string;
  itemsJson: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
}

const emptyPack: PackForm = { code: "", title: "", coins: "", gems: "", itemsJson: "", active: true, starts_at: "", ends_at: "" };

function packToForm(p: GiftPackRow): PackForm {
  const c = p.contents ?? {};
  return {
    id: p.id,
    code: p.code ?? "",
    title: p.title,
    coins: c.coins ? String(c.coins) : "",
    gems: c.gems ? String(c.gems) : "",
    itemsJson: c.items && Object.keys(c.items).length > 0 ? JSON.stringify(c.items, null, 0) : "",
    active: p.active,
    starts_at: isoToLocal(p.starts_at),
    ends_at: isoToLocal(p.ends_at),
  };
}

function GiftsCard() {
  const [rows, setRows] = useState<GiftPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PackForm | null>(null);
  const [granting, setGranting] = useState<GiftPackRow | null>(null);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantAll, setGrantAll] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  /** 儲存／啟停／發放後 bump 重新拉列表 */
  const [tick, setTick] = useState(0);

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    listGiftPacks().then(
      (r) => {
        if (!cancelled) {
          setRows(r);
          setLoading(false);
        }
      },
      () => {
        if (!cancelled) setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);

  function save() {
    if (!editing) return;
    // 驗證 items JSON
    let items: Record<string, number> | undefined;
    const raw = editing.itemsJson.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
        items = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v !== "number" || v <= 0) throw new Error("bad value");
          items[k] = Math.floor(v);
        }
      } catch {
        setMsg("");
        setErr('道具格式錯誤：請用 {"道具id": 數量}，例如 {"chopsticks": 10}');
        return;
      }
    }
    const contents: GiftContents = {
      coins: editing.coins ? Math.max(0, Math.floor(Number(editing.coins))) : undefined,
      gems: editing.gems ? Math.max(0, Math.floor(Number(editing.gems))) : undefined,
      items: items && Object.keys(items).length > 0 ? items : undefined,
    };
    if (!contents.coins && !contents.gems && !contents.items) {
      setMsg("");
      setErr("內容至少要有金幣 / 寶石 / 道具其中一項");
      return;
    }
    startTransition(async () => {
      const res = await saveGiftPack({
        id: editing.id,
        code: editing.code,
        title: editing.title,
        contents,
        active: editing.active,
        starts_at: localToIso(editing.starts_at),
        ends_at: localToIso(editing.ends_at),
      });
      if (res.ok) {
        setEditing(null);
        setMsg("禮包已儲存");
        setErr("");
        reload();
      } else {
        setMsg("");
        setErr(res.error ?? "儲存失敗");
      }
    });
  }

  function doGrant() {
    if (!granting) return;
    startTransition(async () => {
      const res = await grantGift(granting.id, grantAll ? { all: true } : { userId: grantUserId.trim() });
      if (res.ok) {
        setGranting(null);
        setGrantUserId("");
        setGrantAll(false);
        setMsg(`發放完成：${res.granted} 份`);
        setErr("");
        reload();
      } else {
        setMsg("");
        setErr(res.error ?? "發放失敗");
      }
    });
  }

  return (
    <Card
      title="禮包管理"
      actions={
        <Btn size="sm" onClick={() => setEditing({ ...emptyPack })}>
          + 新增
        </Btn>
      }
    >
      <OkBanner message={msg} />
      <ErrorBanner message={err} />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState label="未有禮包" />
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-800">{p.title}</span>
                    {p.code ? <Badge tone="amber">碼：{p.code}</Badge> : null}
                    {p.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}
                    <Badge tone="blue">已發 {p.grantedCount ?? 0}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {[
                      p.contents?.coins ? `金幣 ${p.contents.coins}` : null,
                      p.contents?.gems ? `寶石 ${p.contents.gems}` : null,
                      p.contents?.items ? `道具 ${Object.entries(p.contents.items).map(([k, v]) => `${k}×${v}`).join("、")}` : null,
                    ]
                      .filter(Boolean)
                      .join("・") || "（空）"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Btn size="sm" onClick={() => setGranting(p)}>
                    發放
                  </Btn>
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => startTransition(async () => { await setGiftPackActive(p.id, !p.active); reload(); })}
                  >
                    {p.active ? "停用" : "啟用"}
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setEditing(packToForm(p))}>
                    編輯
                  </Btn>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 禮包編輯 Modal */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "編輯禮包" : "新增禮包"}
        wide
        footer={
          <>
            <Btn variant="subtle" onClick={() => setEditing(null)}>
              取消
            </Btn>
            <Btn disabled={pending} onClick={save}>
              儲存
            </Btn>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="名稱">
                <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} placeholder="開服慶禮包" />
              </Field>
              <Field label="兌換碼（可留空）" hint="玩家在個人頁輸入兌換；同一碼每人限領一次">
                <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} className={inputCls} placeholder="WELCOME2026" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="金幣">
                <input type="number" min={0} value={editing.coins} onChange={(e) => setEditing({ ...editing, coins: e.target.value })} className={inputCls} placeholder="500" />
              </Field>
              <Field label="寶石">
                <input type="number" min={0} value={editing.gems} onChange={(e) => setEditing({ ...editing, gems: e.target.value })} className={inputCls} placeholder="20" />
              </Field>
            </div>
            <Field label='道具（JSON）' hint='例如 {"chopsticks": 10, "chopsticks_golden": 2}；金幣/寶石/道具至少填一項'>
              <textarea value={editing.itemsJson} onChange={(e) => setEditing({ ...editing, itemsJson: e.target.value })} rows={3} className={`${inputCls} font-mono text-xs`} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="開始時間（可留空）">
                <input type="datetime-local" value={editing.starts_at} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value })} className={inputCls} />
              </Field>
              <Field label="結束時間（可留空）">
                <input type="datetime-local" value={editing.ends_at} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Toggle checked={editing.active} onChange={(b) => setEditing({ ...editing, active: b })} label="啟用" />
          </div>
        )}
      </Modal>

      {/* 發放 Modal */}
      <Modal
        open={granting !== null}
        onClose={() => setGranting(null)}
        title={`發放禮包：${granting?.title ?? ""}`}
        footer={
          <>
            <Btn variant="subtle" onClick={() => setGranting(null)}>
              取消
            </Btn>
            <Btn variant="danger" disabled={pending || (!grantAll && !grantUserId.trim())} onClick={doGrant}>
              {pending ? "發放中…" : grantAll ? "確認全服發放" : "發放"}
            </Btn>
          </>
        }
      >
        {granting && (
          <div className="space-y-3">
            <Toggle checked={grantAll} onChange={setGrantAll} label="全服發放（所有有雲存檔的玩家）" />
            {!grantAll && (
              <Field label="玩家 user_id" hint="可於「玩家管理」搜尋後複製">
                <input value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} className={inputCls} placeholder="00000000-0000-…（完整 UUID）" />
              </Field>
            )}
            <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              直接發放的禮包會進入玩家「禮包信箱」，玩家在遊戲個人頁領取。
              每位玩家每個禮包只能領一次（重複發放會被擋）。
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ── 主件 ─────────────────────────────────────────────

export default function OpsView() {
  const [config, setConfig] = useState<{ maintenance: MaintenanceConfig; version: VersionConfig } | null>(null);
  const [error, setError] = useState("");
  /** 維護／版本儲存後 bump 重新拉設定 */
  const [tick, setTick] = useState(0);

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    getAppConfig().then(
      (c) => {
        if (!cancelled) {
          setConfig(c);
          setError("");
        }
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "載入失敗");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (!config) {
    return (
      <>
        <ErrorBanner message={error} />
        <Spinner />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black text-slate-900">營運設定</h1>
      <ErrorBanner message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <MaintenanceCard
          key={`m-${config.maintenance.enabled}-${config.maintenance.message}`}
          config={config.maintenance}
          onSaved={() => setTick((t) => t + 1)}
        />
        <VersionCard
          key={`v-${config.version.minVersion}-${config.version.androidUrl}-${config.version.iosUrl}-${config.version.forceUpdate}`}
          config={config.version}
          onSaved={() => setTick((t) => t + 1)}
        />
      </div>
      <AnnouncementsCard />
      <GiftsCard />
    </div>
  );
}
