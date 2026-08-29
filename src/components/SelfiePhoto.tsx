"use client";

import { Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SPECIES_MAP } from "@/content/species";
import SpiritModel, { type SpiritAnim } from "@/components/three/SpiritModel";
import UIIcon from "@/components/UIIcon";
const SELFIE_SCALE_MIN = 0.55;
const SELFIE_SCALE_MAX = 1.85;

/** 喺 canvas 畫一個白色對話泡泡（自拍影相時連對白影埋入相，跟精靈螢幕位置） */
function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  anchorY: number,
  text: string,
  vw: number
) {
  const fs = Math.max(18, Math.round(vw * 0.045));
  ctx.font = `900 ${fs}px "openhuninn", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const tw = ctx.measureText(text).width;
  const padX = fs * 0.7;
  const padY = fs * 0.5;
  const bw = tw + padX * 2;
  const bh = fs + padY * 2;
  const r = bh / 2;
  const gap = fs * 0.5;
  const above = anchorY - gap - bh >= 6;
  const y0 = above ? anchorY - gap - bh : anchorY + gap;
  let x0 = cx - bw / 2;
  x0 = Math.max(6, Math.min(vw - bw - 6, x0));
  // 圓角矩形
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x0 + bw, y0, x0 + bw, y0 + bh, r);
  ctx.arcTo(x0 + bw, y0 + bh, x0, y0 + bh, r);
  ctx.arcTo(x0, y0 + bh, x0, y0, r);
  ctx.arcTo(x0, y0, x0 + bw, y0, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.lineWidth = Math.max(2, fs * 0.12);
  ctx.strokeStyle = "rgba(42,26,12,0.22)";
  ctx.stroke();
  // 小尾巴指向精靈（只喺泡泡喺上面時畫）
  if (above) {
    const txc = Math.max(x0 + r, Math.min(x0 + bw - r, cx));
    ctx.beginPath();
    ctx.moveTo(txc - fs * 0.35, y0 + bh - 1);
    ctx.lineTo(txc, y0 + bh + fs * 0.5);
    ctx.lineTo(txc + fs * 0.35, y0 + bh - 1);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fill();
  }
  ctx.fillStyle = "#2a1a0c";
  ctx.fillText(text, x0 + bw / 2, y0 + bh / 2 + 1);
}

/** 自拍用 3D 精靈：喺你拖嘅錨點附近「活潑咁走來走去」（行走／小停頓／面向移動方向），
 *  並每 frame 將頭頂投影返螢幕座標，俾對話泡泡跟住佢；跟捕捉狀態用 3D 模型。 */
function SelfieSpirit3d({
  speciesId,
  posRef,
  bubbleAnchorRef,
  bubbleElRef,
  scaleRef,
}: {
  speciesId: string;
  posRef: { current: { x: number; y: number } };
  bubbleAnchorRef: { current: { x: number; y: number } };
  bubbleElRef: { current: HTMLDivElement | null };
  /** 用戶縮放（左右拖位路徑；每 frame 讀 ref 免 re-render） */
  scaleRef: { current: number };
}) {
  const species = SPECIES_MAP[speciesId];
  const group = useRef<THREE.Group>(null);
  // 接地陰影（sibling，唔入 group：唔可以跟寵物彈跳升降，否則睇落係貼腳底嘅貼紙）
  const shadowMesh = useRef<THREE.Mesh>(null);
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null);
  const { viewport, camera, size } = useThree();
  const h = species?.modelHeightM ?? 0.5;
  const [anim, setAnim] = useState<SpiritAnim>("idle");
  const animRef = useRef<SpiritAnim>("idle");
  const cur = useRef({ x: 0, y: 0, inited: false });
  const tgt = useRef({ x: 0, y: 0 });
  const dwell = useRef(0);
  const proj = useRef(new THREE.Vector3());
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const userScale = scaleRef.current;

    const p = posRef.current;
    // 拖動錨點（螢幕比例）→ z=0 世界座標，作為漫步中心
    const cx = (p.x - 0.5) * viewport.width;
    const cy = (0.5 - p.y) * viewport.height;
    if (!cur.current.inited) {
      cur.current = { x: cx, y: cy, inited: true };
      tgt.current = { x: cx, y: cy };
    }
    const halfX = viewport.width * 0.2;
    const halfY = viewport.height * 0.1;
    const dx = tgt.current.x - cur.current.x;
    const dy = tgt.current.y - cur.current.y;
    const dist = Math.hypot(dx, dy);
    let lean = 0;
    if (dist < 0.03) {
      // 到埗：短暫停頓（活潑＝停得短）再抽下一個目標
      dwell.current -= dt;
      if (dwell.current <= 0) {
        tgt.current = {
          x: cx + (Math.random() * 2 - 1) * halfX,
          y: cy + (Math.random() * 2 - 1) * halfY,
        };
        dwell.current = 0.5 + Math.random() * 0.9;
      }
      if (animRef.current !== "idle") {
        animRef.current = "idle";
        setAnim("idle");
      }
    } else {
      const spd = Math.min(dist, viewport.width * 0.22 * dt);
      cur.current.x += (dx / dist) * spd;
      cur.current.y += (dy / dist) * spd;
      lean = -Math.sign(dx) * 0.22; // 面向移動方向輕微傾
      if (animRef.current !== "walk") {
        animRef.current = "walk";
        setAnim("walk");
      }
    }
    // clamp 喺可見框內（唔好行出畫面）
    const mx = viewport.width * 0.5 - h * 0.4;
    const my = viewport.height * 0.5 - h * 0.9;
    cur.current.x = Math.max(-mx, Math.min(mx, cur.current.x));
    cur.current.y = Math.max(-my, Math.min(my, cur.current.y));
    const tt = state.clock.elapsedTime;
    const bobAmp = animRef.current === "walk" ? Math.abs(Math.sin(tt * 6)) * 0.07 : Math.abs(Math.sin(tt * 2)) * 0.04;
    const hh = h * userScale;
    g.scale.setScalar(userScale);
    g.position.set(cur.current.x, cur.current.y - hh / 2 + bobAmp * hh, 0);
    g.rotation.y += (lean - g.rotation.y) * Math.min(1, dt * 8);
    // 螢幕錨定係平面疊圖（全部喺 z=0），冇真地面可以投影——用壓扁橢圓做腳下影
    const sm = shadowMesh.current;
    if (sm) {
      sm.visible = true;
      sm.rotation.set(0, 0, 0);
      sm.position.set(cur.current.x, cur.current.y - hh * 0.54, -0.02);
      const k = (1 - Math.min(0.4, bobAmp * 3.2)) * userScale;
      sm.scale.set(k, k * 0.3, 1);
      if (shadowMat.current) shadowMat.current.opacity = 0.24 * Math.min(1, k);
    }
    // 頭頂投影 → 螢幕 px（泡泡錨點；DOM 泡泡每 frame 跟住郁，唔使 React re-render）
    proj.current.set(cur.current.x, cur.current.y + hh * 0.55, 0).project(camera);
    const sx = (proj.current.x * 0.5 + 0.5) * size.width;
    const sy = (-proj.current.y * 0.5 + 0.5) * size.height;
    bubbleAnchorRef.current.x = sx;
    bubbleAnchorRef.current.y = sy;
    if (bubbleElRef.current) {
      bubbleElRef.current.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy - 10}px)`;
    }
  });
  if (!species) return null;
  return (
    <>
      <group ref={group}>
        <SpiritModel speciesId={speciesId} anim={anim} shadow={false} />
      </group>
      {/* 位置／朝向／透明度全部喺 useFrame 按分支設定（gyro = 地面圓影，螢幕錨定 = 壓扁橢圓）。
          半徑要闊過模型自己嘅底座（好多精靈自帶碟／飯糰底），唔係個影會被底座蓋到睇唔見 */}
      <mesh ref={shadowMesh} visible={false}>
        <circleGeometry args={[h * 0.62, 32]} />
        <meshBasicMaterial ref={shadowMat} color="#000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </>
  );
}

/**
 * 捕捉成功後「同精靈自拍」：開相機（預設前置）全屏預覽，精靈疊喺畫面可拖動搬錨點，
 * 影相 canvas 合成 → 提供儲存／再影／分享。前置鏡預覽同合成都水平鏡像先自然。
 * 有 WebGL＋3D 模型：透明 R3F Canvas render 會郁嘅 3D 精靈（跟捕捉狀態）；否則 2D 立繪 fallback。
 * unmount／關閉時必停 stream（唔可以霸住相機）。
 */
export function SelfiePhoto({
  speciesId,
  webglOk,
  onClose,
}: {
  speciesId: string;
  webglOk: boolean;
  /** @deprecated 自拍已改手動左右＋縮放，忽略陀螺儀 */
  gyro?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const spiritImgRef = useRef<HTMLImageElement | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const use3d = webglOk && Boolean(SPECIES_MAP[speciesId]?.modelUrl);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [denied, setDenied] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  // 精靈立繪位置（畫面比例，預設中下）＋拖動＋縮放
  const [pos, setPos] = useState({ x: 0.5, y: 0.7 });
  const posRef = useRef({ x: 0.5, y: 0.7 });
  const [spiritScale, setSpiritScale] = useState(1);
  const scaleRef = useRef(1);
  const dragRef = useRef<{ id: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 自拍對話泡泡：文字 state ＋精靈頭頂螢幕座標（3D 由 SelfieSpirit3d 每 frame 更新）
  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleAnchorRef = useRef({ x: 0, y: 0 });
  const bubbleElRef = useRef<HTMLDivElement | null>(null);

  // 定時彈搞笑對白（跟 locale）令自拍生動；影相時會連當下泡泡影埋入相
  useEffect(() => {
    if (shot || denied) return;
    const lines = (t.raw("capture.bubblesSelfie") as string[]) ?? [];
    if (!lines.length) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    const say = () => {
      setBubble(lines[Math.floor(Math.random() * lines.length)]);
      hideTimer = setTimeout(() => setBubble(null), 2600);
    };
    const first = setTimeout(say, 700);
    const iv = setInterval(say, 3600);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      clearTimeout(hideTimer);
    };
  }, [shot, denied, t]);

  // 開／換鏡頭：每次先停舊 stream 再開新
  useEffect(() => {
    let active = true;
    (async () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (active) setDenied(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [facing]);

  // unmount：一定要停晒相機
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    },
    []
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    posRef.current = { x, y };
    setPos({ x, y });
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const takeShot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 前置鏡：合成都要鏡像返先同預覽一致
    if (facing === "user") {
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (use3d) {
      // 3D 精靈：疊 R3F canvas（本身冇鏡像，唔使反）；靠 preserveDrawingBuffer 讀到最後一 frame
      const dom = glRef.current?.domElement;
      if (dom) ctx.drawImage(dom, 0, 0, vw, vh);
    } else {
      // 2D 立繪 fallback：疊喺 posRef 位（唔鏡像，同畫面所見一致）
      const img = spiritImgRef.current;
      if (img && img.complete && img.naturalWidth) {
        const sw = vw * 0.44 * scaleRef.current;
        const sh = sw * (img.naturalHeight / img.naturalWidth);
        const cx = posRef.current.x * vw;
        const cy = posRef.current.y * vh;
        ctx.drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh);
      }
    }
    // 對話泡泡影埋入相（跟住精靈當下螢幕位置）
    if (bubble) {
      const rect = wrapRef.current?.getBoundingClientRect();
      let bx: number, by: number;
      if (use3d && rect && rect.width) {
        bx = (bubbleAnchorRef.current.x / rect.width) * vw;
        by = (bubbleAnchorRef.current.y / rect.height) * vh;
      } else {
        bx = posRef.current.x * vw;
        by = posRef.current.y * vh - vh * 0.16;
      }
      drawSpeechBubble(ctx, bx, by, bubble, vw);
    }
    setShot(canvas.toDataURL("image/png"));
  };

  const dataUrlToFile = async (url: string) => {
    const blob = await (await fetch(url)).blob();
    return new File([blob], `hawker-hunt-${speciesId}.png`, { type: "image/png" });
  };
  /**
   * 儲存相片：手機一定要經 share sheet 先入得相簿（iOS Safari 撳 <a download> 只會
   * 開新一頁圖，Android 亦只落 Downloads 而唔係相簿）。share sheet 入面有
   * 「儲存影像／存入相簿」同埋直接分享去 IG，一個掣搞掂兩件事。
   */
  const savePhoto = async () => {
    if (!shot) return;
    const fallbackDownload = () => {
      const a = document.createElement("a");
      a.href = shot;
      a.download = `hawker-hunt-${speciesId}.png`;
      a.click();
    };
    let file: File;
    try {
      file = await dataUrlToFile(shot);
    } catch {
      fallbackDownload();
      return;
    }
    if (!navigator.canShare?.({ files: [file] })) {
      fallbackDownload();
      return;
    }
    try {
      await navigator.share({ files: [file], title: t("capture.photoTitle") });
    } catch (err) {
      // 用戶自己取消就唔好再彈下載；真係唔支援先退回下載
      if ((err as Error)?.name !== "AbortError") fallbackDownload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-testid="selfie">
      <div ref={wrapRef} className="relative flex-1 overflow-hidden">
        {denied ? (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm font-bold text-white/85">
            {t("capture.photoDenied")}
          </div>
        ) : (
          <>
            {/* video 一定要一直 mount：以前 shot 時換成 <img> 會 unmount video，
                撳「再影」setShot(null) 後 effect 只睇 facing 唔會重跑 → 新 video 冇 srcObject＝黑屏 */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover ${shot ? "invisible" : ""}`}
              style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
            />
            {shot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot} alt="" className="absolute inset-0 z-[1] h-full w-full object-cover" />
            )}
          </>
        )}

        {/* 3D 為主：透明 R3F Canvas 疊喺 video 上面 render 會郁嘅精靈（跟捕捉狀態）；
            拖動全屏層＝搬錨點（拖去邊精靈就去邊企／浮游） */}
        {!shot && !denied && use3d && (
          <>
            <Canvas
              className="pointer-events-none absolute inset-0"
              camera={{ fov: 45, position: [0, 0, 2.2] }}
              gl={{ alpha: true, preserveDrawingBuffer: true }}
              onCreated={({ gl }) => {
                glRef.current = gl;
              }}
            >
              <ambientLight intensity={1.15} />
              <directionalLight position={[2, 4, 2]} intensity={1.25} />
              <Suspense fallback={null}>
                <SelfieSpirit3d
                  speciesId={speciesId}
                  posRef={posRef}
                  bubbleAnchorRef={bubbleAnchorRef}
                  bubbleElRef={bubbleElRef}
                  scaleRef={scaleRef}
                />
              </Suspense>
            </Canvas>
            {bubble && (
              <div ref={bubbleElRef} className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform">
                <div className="bubble-pop whitespace-nowrap rounded-2xl border-2 border-ink/20 bg-white/95 px-3.5 py-1.5 text-sm font-black text-ink shadow-lg">
                  {bubble}
                </div>
              </div>
            )}
            <div
              data-testid="selfie-drag"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="absolute inset-0 z-10 touch-none"
            />
          </>
        )}
        {/* 2D 立繪 fallback（冇 WebGL／冇 3D 模型）：可拖動＋上下 bob 令佢生動啲 */}
        {!shot && !denied && !use3d && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing"
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
          >
            {bubble && (
              <div className="bubble-pop pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-2xl border-2 border-ink/20 bg-white/95 px-3.5 py-1.5 text-sm font-black text-ink shadow-lg">
                {bubble}
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={spiritImgRef}
              src={`/spirits/full/${speciesId}.webp`}
              alt=""
              draggable={false}
              className="float-bob pointer-events-none h-44 w-auto select-none drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
              style={{ transform: `scale(${spiritScale})` }}
            />
          </div>
        )}
        {/* 2D fallback 影相後預載俾 canvas 合成（3D 路徑用 gl canvas，唔使呢個） */}
        {shot && !use3d && (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={spiritImgRef} src={`/spirits/full/${speciesId}.webp`} alt="" className="hidden" />
        )}

        {/* 頂欄：避過 status bar／瀏覽器 chrome（safe-area + 少少空隙，唔好貼邊難撳） */}
        {!shot && !denied && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-16"
            style={{ top: "calc(env(safe-area-inset-top) + 14px)" }}
          >
            <span className="rounded-full bg-black/55 px-4 py-1.5 text-xs font-bold text-white">
              {t("capture.photoHint")}
            </span>
          </div>
        )}

        {/* 關閉 */}
        <button
          onClick={onClose}
          aria-label={t("capture.photoClose")}
          className="absolute left-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
          style={{ top: "calc(env(safe-area-inset-top) + 14px)" }}
        >
          ←
        </button>
        {/* 切換前置／後置（未影相前先俾切） */}
        {!shot && !denied && (
          <button
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            aria-label={t("capture.photoFlip")}
            className="absolute right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
            style={{ top: "calc(env(safe-area-inset-top) + 14px)" }}
          >
            <UIIcon name="camera" size={20} />
          </button>
        )}
      </div>

      {/* 底部：縮放滑桿（未影相）＋快門／儲存 */}
      <div
        className="flex flex-col gap-3 bg-black px-6 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)" }}
      >
        {!shot && !denied && (
          <label className="flex items-center gap-3 text-xs font-bold text-white/90">
            <span className="shrink-0">{t("capture.photoSize")}</span>
            <input
              type="range"
              min={SELFIE_SCALE_MIN}
              max={SELFIE_SCALE_MAX}
              step={0.01}
              value={spiritScale}
              data-testid="selfie-scale"
              data-no-press-sfx
              onChange={(e) => {
                const v = Number(e.target.value);
                scaleRef.current = v;
                setSpiritScale(v);
              }}
              className="h-2 w-full accent-gold"
            />
          </label>
        )}
        <div className="flex items-center justify-center gap-4">
          {shot ? (
            <>
              <button
                onClick={() => {
                  setShot(null);
                  requestAnimationFrame(() => {
                    void videoRef.current?.play().catch(() => {});
                  });
                }}
                className="btn-outline px-6 py-3 text-sm font-bold text-white"
              >
                {t("capture.photoRetake")}
              </button>
              <button
                onClick={savePhoto}
                data-testid="selfie-save"
                className="btn-gold px-8 py-3 text-base font-black"
              >
                {t("capture.photoSave")}
              </button>
            </>
          ) : (
            !denied && (
              <button
                onClick={takeShot}
                data-testid="selfie-shot"
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 active:scale-90"
                aria-label={t("capture.photoCapture")}
              >
                <span className="h-11 w-11 rounded-full bg-white" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
