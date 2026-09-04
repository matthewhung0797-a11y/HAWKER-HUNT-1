"use client";

// 音樂管理：上傳 BGM MP3（存 Supabase Storage bucket "bgm"）＋曲目啟用/停用/刪除。
// 上傳嘅曲目即刻出現喺玩家地圖音樂播放器清單（getMusicTracks → registerDynamicTracks）。

import { useEffect, useRef, useState, useTransition } from "react";
import { listBgmTracks, uploadBgmTrack, setBgmTrackActive, deleteBgmTrack } from "@/lib/admin/actions";
import type { BgmTrackRow } from "@/lib/admin/types";
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
  return iso ? iso.slice(0, 16).replace("T", " ") : "—";
}

export default function MusicAdminView() {
  const [rows, setRows] = useState<BgmTrackRow[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  // 上傳表單
  const [titleZh, setTitleZh] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    startTransition(async () => {
      const r = await listBgmTracks();
      setRows(r);
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doUpload() {
    if (!file || !titleZh.trim()) {
      setMsg("");
      setErr("請填名稱並選擇 MP3 檔案");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".mp3")) {
      setMsg("");
      setErr("只接受 MP3 檔案");
      return;
    }
    startTransition(async () => {
      const buf = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), "")
      );
      const res = await uploadBgmTrack({
        titleZh,
        titleEn,
        sort: rows?.length ?? 0,
        fileBase64: base64,
      });
      if (res.ok) {
        setErr("");
        setMsg("已上傳並啟用");
        setTitleZh("");
        setTitleEn("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        reload();
      } else {
        setMsg("");
        setErr(res.error ?? "上傳失敗");
      }
    });
  }

  function toggle(row: BgmTrackRow) {
    startTransition(async () => {
      await setBgmTrackActive(row.id, !row.active);
      reload();
    });
  }

  function remove(row: BgmTrackRow) {
    if (!window.confirm(`確定刪除曲目「${row.title.zh}」？（Storage 檔案一併刪除）`)) return;
    startTransition(async () => {
      await deleteBgmTrack(row.id);
      reload();
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black text-slate-900">音樂管理</h1>

      <OkBanner message={msg} />
      <ErrorBanner message={err} />

      <Card title="上傳新 BGM（MP3，上限 8MB）">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="名稱（中文）">
              <input value={titleZh} onChange={(e) => setTitleZh(e.target.value)} className={inputCls} placeholder="夏日祭典主題曲" />
            </Field>
            <Field label="名稱（英文）" hint="留空 = 同中文">
              <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className={inputCls} placeholder="Summer Festival" />
            </Field>
          </div>
          <Field label="MP3 檔案" hint="建議 64-128kbps、3-5 分鐘以內（檔案越小，手機載入越快）">
            <input
              ref={fileRef}
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={inputCls}
            />
          </Field>
          <Btn disabled={pending || !file || !titleZh.trim()} onClick={doUpload}>
            {pending ? "上傳中…" : "上傳並啟用"}
          </Btn>
        </div>
      </Card>

      <Card title={`曲目列表（${rows?.length ?? 0}）`}>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState label="未有後台上傳嘅曲目" />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-800">🎵 {r.title.zh}</span>
                    <Badge tone={r.active ? "green" : "gray"}>{r.active ? "啟用" : "停用"}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{fmtDate(r.created_at)}</div>
                </div>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    startTransition(async () => {
                      await setBgmTrackActive(r.id, !r.active);
                      reload();
                    });
                  }}
                >
                  {r.active ? "停用" : "啟用"}
                </Btn>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`確定刪除「${r.title.zh}」？`)) return;
                    startTransition(async () => {
                      await deleteBgmTrack(r.id);
                      reload();
                    });
                  }}
                >
                  刪除
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
