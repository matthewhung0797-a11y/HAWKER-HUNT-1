"use client";

// 推送通知（站內）：發送（全服／指定玩家）＋ 發送記錄。
// 遊戲端：地圖頁鈴鐺（未讀紅點）→ 通知列表。

import { useEffect, useState, useTransition } from "react";
import { listNotifications, sendNotification, deleteNotification } from "@/lib/admin/actions";
import type { NotificationRow } from "@/lib/admin/types";
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
} from "../ui";

function fmtDate(iso: string): string {
  return iso ? iso.slice(0, 19).replace("T", " ") : "—";
}

export default function NotificationsView() {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [icon, setIcon] = useState("📣");
  const [link, setLink] = useState("");
  const [targetAll, setTargetAll] = useState(true);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    listNotifications().then(
      (r) => {
        if (!cancelled) setRows(r);
      },
      (e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "載入失敗");
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function send() {
    if (!title.trim() || !body.trim()) {
      setMsg("");
      setErr("標題與內容不可空白");
      return;
    }
    startTransition(async () => {
      const res = await sendNotification({
        title,
        body,
        icon: icon || undefined,
        link: link || undefined,
        userId: targetAll ? undefined : userId,
      });
      if (res.ok) {
        setMsg(targetAll ? "已發送全服通知（玩家地圖鈴鐺即時顯示紅點）" : "已發送給指定玩家");
        setErr("");
        setTitle("");
        setBody("");
        setLink("");
        const fresh = await listNotifications();
        setRows(fresh);
      } else {
        setMsg("");
        setErr(res.error ?? "發送失敗");
      }
    });
  }

  function remove(n: NotificationRow) {
    if (!window.confirm(`確定刪除通知「${n.title}」？（已送出的玩家若未讀，列表也會消失）`)) return;
    startTransition(async () => {
      await deleteNotification(n.id);
      setRows((rs) => rs?.filter((r) => r.id !== n.id) ?? rs);
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black text-slate-900">推送通知</h1>

      <OkBanner message={msg} />
      <ErrorBanner message={err} />

      <Card title="發送通知">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[80px_1fr_1fr]">
            <Field label="圖示" hint="emoji">
              <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} className={inputCls} placeholder="📣" />
            </Field>
            <Field label="標題">
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls} placeholder="週末雙倍活動開跑！" />
            </Field>
            <Field label="連結（站內路由，可留空）">
              <input value={link} onChange={(e) => setLink(e.target.value)} className={inputCls} placeholder="/shop" />
            </Field>
          </div>
          <Field label="內容">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} className={inputCls} placeholder="本週六日起，所有據點精靈出現率加倍！" />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="發送對象">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                  <input type="radio" checked={targetAll} onChange={() => setTargetAll(true)} />
                  全服
                </label>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                  <input type="radio" checked={!targetAll} onChange={() => setTargetAll(false)} />
                  指定玩家
                </label>
              </div>
            </Field>
            {!targetAll && (
              <div className="min-w-0 flex-1">
                <Field label="玩家 user_id" hint="可於「玩家管理」搜尋後複製完整 UUID">
                  <input value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls} placeholder="00000000-0000-…" />
                </Field>
              </div>
            )}
            <Btn disabled={pending} onClick={send}>
              {pending ? "發送中…" : "發送"}
            </Btn>
          </div>
          <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            站內通知：玩家在地圖頁鈴鐺看到未讀紅點，點開列表閱讀（近 30 日、最新 30 條）。
            APK（Unity WebView）不支援作業系統推播，故以遊戲內通知為準。
          </p>
        </div>
      </Card>

      <Card title={`發送記錄（${rows?.length ?? 0}）`}>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState label="未曾發送通知" />
        ) : (
          <ul className="space-y-2">
            {rows.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        {n.icon ? `${n.icon} ` : ""}
                        {n.title}
                      </span>
                      {n.user_id ? <Badge tone="amber">指定玩家</Badge> : <Badge tone="blue">全服</Badge>}
                      {n.link && <Badge tone="gray">{n.link}</Badge>}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{n.body}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{fmtDate(n.created_at)}</div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => remove(n)}>
                    刪除
                  </Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
