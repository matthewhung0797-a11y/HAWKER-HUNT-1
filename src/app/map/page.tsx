"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { HAWKER_CENTRES } from "@/content/centres";
import { SPECIES, SPECIES_MAP } from "@/content/species";
import type { HawkerCentre } from "@/content/types";
import { distanceM, formatDistance } from "@/lib/geo";
import { NAUTICAL_STYLE } from "@/lib/mapStyle";
import { hasWebGL2 } from "@/lib/webgl";
import { useGameStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import GameHeader from "@/components/GameHeader";
import ElementBadge from "@/components/ElementBadge";
import SpiritIcon, { spiritFullArtUrl } from "@/components/SpiritIcon";
import UIIcon from "@/components/UIIcon";
import Avatar3D from "@/components/Avatar3D";
import { MissionButton, MissionPanel, useMissions } from "@/components/MissionPanel";
import NotificationBell from "@/components/NotificationBell";
import { getGameConfig } from "@/lib/admin/actions";
import { sfxTap, isMuted, setMuted } from "@/lib/sfx";
import { playMusic, isMusicMuted, setMusicMuted } from "@/lib/music";

const SG_CENTER: [number, number] = [103.8475, 1.29];
// zoom 下限放到 3：據點跨越 SG↔HK 咁遠嘅範圍要縮得夠細先睇得晒／揀得到。
// 唔設 maxBounds：據點喺圍欄角落（例如香港）時，喺當地 zoom out 視窗一掂界就會卡死；
// 跨國範圍下圍欄已冇實際意義，靠 MIN_ZOOM 防止縮到無限細就夠。
const MIN_ZOOM = 3;

function mockHunters(centreId: string): number {
  let h = 0;
  for (const c of centreId) h = (h * 31 + c.charCodeAt(0)) % 97;
  return 3 + (h % 25);
}

/**
 * 據點徽章 DOM（地圖 marker 用）：金框圓形精靈插圖 + 底部小尖角（地圖 pin 感）。
 * 層級：wrap（maplibre 控制 transform）> scaler（隨 zoom 縮放）> button（浮動動畫＋三態）。
 */
function makeMarkerElement(centre: HawkerCentre): {
  wrap: HTMLDivElement;
  scaler: HTMLDivElement;
  el: HTMLButtonElement;
} {
  const wrap = document.createElement("div");
  wrap.style.cssText = "width:80px;height:90px;overflow:visible";
  const scaler = document.createElement("div");
  scaler.style.cssText = "width:100%;height:100%;overflow:visible";
  const el = document.createElement("button");
  el.className = "marker-bob";
  el.style.cssText =
    "position:relative;width:80px;height:80px;border-radius:9999px;border:3px solid #c9a227;background:#F2E7CF;cursor:pointer;box-shadow:0 4px 10px rgba(74,44,20,.45);padding:0;overflow:visible";
  el.style.animationDelay = `${-(Math.random() * 3).toFixed(2)}s`;
  const img = document.createElement("img");
  img.src = "/ui/hawker-stall-icon.png";
  img.alt = "";
  img.draggable = false;
  img.style.cssText =
    "width:100%;height:100%;border-radius:9999px;object-fit:cover;pointer-events:none";
  const tip = document.createElement("span");
  tip.style.cssText =
    "position:absolute;left:50%;bottom:-9px;margin-left:-7px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #c9a227";
  el.append(img, tip);
  scaler.appendChild(el);
  wrap.appendChild(scaler);
  return { wrap, scaler, el };
}

/** 地圖上遊走嘅野生精靈（撳落去可以入捕捉頁捉佢，Pokémon GO 世界感） */
type Wanderer = {
  marker: maplibregl.Marker;
  root: HTMLDivElement;
  scaler: HTMLDivElement;
  /** 固定尺寸透明命中區（唔跟 worldScale 縮，令手指喺任何 zoom 都撳得中） */
  hit: HTMLDivElement;
  img: HTMLImageElement;
  speciesId: string;
  base: [number, number];
  /** 沿住行嘅路徑（一連串 [lng,lat]；snap 到真街道後就係街道折線） */
  path: [number, number][];
  /** 目前所在頂點 index */
  i: number;
  /** 下一個目標頂點 index */
  target: number;
  /** 行進方向（沿 path 前進 +1 / 折返 -1） */
  dir: 1 | -1;
  /** 步速（米/秒） */
  speed: number;
  /** 目前實際座標 */
  pos: [number, number];
  /** 小休到呢個時間戳先再行（到路口停一停，似真人踱步） */
  restUntil: number;
  /** 手指撳住期間凍結移動，避免精靈由手指下面遊走甩令 tap 落空 */
  pressed: boolean;
  /** 係咪已 snap 落真實道路（idle 後一次過分配） */
  onRoad: boolean;
  /** 海上/山上精靈：永久隱藏（isOnLand 過濾） */
  hidden: boolean;
};

/**
 * 世界縮放：精靈/徽章隨 zoom 縮放，似真係「企喺地圖上」而唔係浮喺屏幕。
 * zoom 16 = 原大；每縮一級細一半（同地圖一致），有下限避免變蚊。
 */
function worldScale(zoom: number, full = 16, min = 0.28, max = 1.25): number {
  return Math.min(max, Math.max(min, Math.pow(2, zoom - full)));
}

/**
 * 傾角隨 zoom 線性變化：zoom ≤ 13.2 完全放平（0°），≥ 15.2 全傾斜（3D 手遊感）。
 * 縮遠時放平至關重要——高傾角 + 低 zoom 會令釘死喺真實座標嘅 marker 被透視投影拉出島外（睇落似跑落海）。
 */
const MAX_PITCH = 0;
function pitchForZoom(_zoom: number, _lo = 13.2, _hi = 15.2): number {
  return 0;
}

/** 喺 base 附近（半徑 metres 內）揀個隨機座標 */
function randomNear(base: [number, number], metres: number): [number, number] {
  const ang = Math.random() * Math.PI * 2;
  const r = metres * (0.35 + Math.random() * 0.65);
  const dLat = (r * Math.sin(ang)) / 111320;
  const dLng = (r * Math.cos(ang)) / (111320 * Math.cos((base[1] * Math.PI) / 180));
  return [base[0] + dLng, base[1] + dLat];
}

/** 兩個經緯座標之間嘅近似米距（本地平面近似，短距足夠準） */
function metersBetween(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * 111320;
  const dLng = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * 由道路折線嘅起點 index 向兩邊延伸，裁出一段總長 ≤ maxM 米嘅子路徑。
 * 令精靈沿真街道行但唔會離開據點太遠（唔會沿住一條主幹路走去天腳底）。
 */
function windowPath(
  line: [number, number][],
  startIdx: number,
  maxM: number
): { path: [number, number][]; start: number } {
  let lo = startIdx;
  let hi = startIdx;
  let d = 0;
  while (hi + 1 < line.length) {
    const step = metersBetween(line[hi], line[hi + 1]);
    if (d + step > maxM) break;
    d += step;
    hi++;
  }
  d = 0;
  while (lo - 1 >= 0) {
    const step = metersBetween(line[lo - 1], line[lo]);
    if (d + step > maxM) break;
    d += step;
    lo--;
  }
  return { path: line.slice(lo, hi + 1).map((c) => [c[0], c[1]] as [number, number]), start: startIdx - lo };
}

/**
 * 由 vector tiles 攞 base 附近嘅道路折線（lng/lat）。
 * queryRenderedFeatures 只查已載入 tiles 且 zoom 夠先有路——所以要喺地圖 idle（tiles 落齊）後先叫。
 */
function roadsNear(map: maplibregl.Map, base: [number, number], maxMeters = 220): [number, number][][] {
  const c = map.project(base);
  const edge = map.project([base[0], base[1] + maxMeters / 111320]);
  const px = Math.min(240, Math.max(60, Math.abs(c.y - edge.y)));
  let feats: maplibregl.MapGeoJSONFeature[] = [];
  try {
    feats = map.queryRenderedFeatures(
      [
        [c.x - px, c.y - px],
        [c.x + px, c.y + px],
      ],
      { layers: ["road-primary", "road-secondary", "road-minor", "road-path"] }
    );
  } catch {
    return [];
  }
  const lines: [number, number][][] = [];
  for (const f of feats) {
    const g = f.geometry;
    if (g.type === "LineString") lines.push(g.coordinates as [number, number][]);
    else if (g.type === "MultiLineString")
      for (const l of g.coordinates) lines.push(l as [number, number][]);
  }
  return lines;
}

/** 檢查座標是否在陸地上（非水面）——查 vector tiles 的 water 層 */
function isOnLand(map: maplibregl.Map, lng: number, lat: number): boolean {
  try {
    const p = map.project([lng, lat]);
    const feats = map.queryRenderedFeatures([p.x, p.y], { layers: ["water"] });
    // 有 water feature = 在水面/海上
    return feats.length === 0;
  } catch {
    return true; // 查不到時假設是陸地
  }
}

function makeWanderer(
  map: maplibregl.Map,
  speciesId: string,
  base: [number, number],
  title: string,
  onCatch: (speciesId: string, spiritPos: [number, number]) => void
): Wanderer {
  const root = document.createElement("div");
  // 注意：唔可以喺度落 position:relative——會蓋過 maplibre 嘅 .maplibregl-marker{position:absolute}，
  // 令 marker 跌返入正常文檔流、互相堆疊而向下漂（縮遠時睇落似跑咗落海）。留返俾 maplibre class 控制。
  // opacity 亦唔可以落喺 root：maplibre 每幀都會覆寫 marker element 嘅 style.opacity（cover-fade 功能），
  // 所以顯示／收埋要落喺內層 scaler。
  // root 保持 pointer-events:none（唔加 transform／position）；可撳目標落喺內層 bob（唔違反 marker 鐵律）。
  root.style.cssText = "width:52px;height:52px;pointer-events:none;overflow:visible";
  const scaler = document.createElement("div");
  // transform-origin 底部中央：縮放時腳部（root 底邊）保持貼地
  scaler.style.cssText =
    "position:absolute;inset:0;overflow:visible;transform-origin:50% 100%";
  const shadow = document.createElement("div");
  shadow.className = "spirit-shadow";
  shadow.style.cssText =
    "position:absolute;bottom:0;left:13px;width:26px;height:8px;border-radius:9999px;background:rgba(74,44,20,.4)";
  const bob = document.createElement("div");
  bob.className = "spirit-bob";
  bob.style.cssText = "position:absolute;inset:0;overflow:visible;pointer-events:none";
  const delay = `${-(Math.random() * 1.6).toFixed(2)}s`;
  bob.style.animationDelay = delay;
  shadow.style.animationDelay = delay;
  const img = document.createElement("img");
  img.src = `/spirits/full/${speciesId}.webp`;
  img.alt = "";
  img.draggable = false;
  // 52px root 內，img 52px 填滿，object-position:bottom 令腳部貼底
  img.style.cssText =
    "position:absolute;bottom:0;left:0;width:52px;height:52px;object-fit:contain;object-position:bottom;filter:brightness(1.5) drop-shadow(0 2px 3px rgba(74,44,20,.35))";
  bob.appendChild(img);
  scaler.append(shadow, bob);
  root.appendChild(scaler);

  const hit = document.createElement("div");
  hit.style.cssText =
    "position:absolute;top:50%;left:50%;width:64px;height:64px;margin:-32px 0 0 -32px;pointer-events:auto;cursor:pointer;touch-action:none;z-index:2";
  hit.title = title;
  root.appendChild(hit);

  const start = randomNear(base, 60);
  const marker = new maplibregl.Marker({ element: root, anchor: "bottom" }).setLngLat(start).addTo(map);
  const wanderer: Wanderer = {
    marker,
    root,
    scaler,
    hit,
    img,
    speciesId,
    base,
    path: [start, randomNear(base, 60)],
    i: 0,
    target: 1,
    dir: 1,
    speed: 3.2 + Math.random() * 3.6,
    pos: [start[0], start[1]],
    restUntil: performance.now() + Math.random() * 1500,
    pressed: false,
    onRoad: false,
    hidden: false,
  };

  // 自判 tap：唔靠合成 click（精靈會郁，手指微動就令 click 落空）。
  // pointerdown 記低起點＋凍住移動；pointerup 喺短時間／細位移內先當一 tap。
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;
  const release = () => {
    wanderer.pressed = false;
    img.style.opacity = "1";
  };
  hit.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    downX = e.clientX;
    downY = e.clientY;
    downAt = performance.now();
    moved = false;
    wanderer.pressed = true; // 凍住，唔好由手指下面遊走甩
    img.style.opacity = "0.6";
  });
  hit.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - downX) > 12 || Math.abs(e.clientY - downY) > 12) moved = true;
  });
  hit.addEventListener("pointerup", (e) => {
    const wasTap = !moved && performance.now() - downAt < 500;
    release();
    if (wasTap) {
      e.stopPropagation();
      onCatch(speciesId, wanderer.pos);
    }
  });
  hit.addEventListener("pointercancel", release);
  hit.addEventListener("pointerleave", release);

  return wanderer;
}

export default function MapPage() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const playerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const playerScalerRef = useRef<HTMLDivElement | null>(null);
  /** 3D avatar 掛載點（React portal 目標）：state 版——地圖重建時 portal 要重新掛新 DOM */
  const [avatarHost, setAvatarHost] = useState<HTMLDivElement | null>(null);
  const avatarHostRef = useRef<HTMLDivElement | null>(null);
  /** avatar 平滑步行動畫狀態 */
  const playerAnim = useRef<{ raf: number; cur: [number, number] }>({ raf: 0, cur: SG_CENTER });
  const playerPosRef = useRef<[number, number] | null>(null);
  /** centreId → marker DOM element（直接 ref，唔用 querySelector） */
  const markerEls = useRef<Record<string, HTMLElement>>({});

  const store = useGameStore();
  const [playerPos, setPlayerPos] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<HawkerCentre | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [mapFailed, setMapFailed] = useState<string | null>(null);
  /** 地圖重建世代：WebGL context 俾 iOS 回收／rAF 停擺（畫面凍結）時 +1 自動重起 */
  const [mapEpoch, setMapEpoch] = useState(0);
  /** watchdog 重建上限（rAF 全域死咗嘅極端情況唔好無限重建） */
  const watchdogRebuilds = useRef(0);
  // 初始值固定 true 避免 SSR/client hydration mismatch（isMuted 讀 localStorage），mount 後先同步真值
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);
  const { dailyMissions, specialMissions, claimMission } = useMissions();
  /** 非 WebGL 降級列表模式用：後台停用嘅據點（地圖模式喺 init effect 內自行過濾） */
  const [inactiveCentres, setInactiveCentres] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (mapFailed === null) return; // 得列表模式先需要
    let cancelled = false;
    getGameConfig().then(
      (cfg) => {
        if (cancelled) return;
        const s = new Set(
          Object.entries(cfg.centres)
            .filter(([, v]) => !v.active)
            .map(([k]) => k)
        );
        setInactiveCentres(s);
      },
      () => {
        /* 未配置 → 顯示全部 */
      }
    );
    return () => {
      cancelled = true;
    };
  }, [mapFailed]);

  // 地圖主題音樂（autoplay 被拒會等首次手勢自動開始）
  // 兩邊 mute key 任一為靜音就當關聲，並寫齊兩邊（修舊版不同步）
  useEffect(() => {
    const off = isMuted() || isMusicMuted();
    setMuted(off);
    setMusicMuted(off);
    setSoundOn(!off);
    playMusic("map");
  }, []);

  // 初始化地圖（WebGL2 預檢 + try/catch，失敗降級列表模式）
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    if (!hasWebGL2()) {
      setMapFailed("WebGL2 unavailable");
      return;
    }

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: NAUTICAL_STYLE,
        // 開場遠景平視 → load 後電影式飛入傾斜 3D 視角
        center: SG_CENTER,
        zoom: 14,
        pitch: 0,
        bearing: -30,
        maxPitch: 0,
        // 鎖 zoom 下限：防止縮太細令 marker 溢出島外
        minZoom: MIN_ZOOM,
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.error("[map] init failed:", err);
      setMapFailed(err instanceof Error ? err.message : String(err));
      return;
    }
    mapRef.current = map;

    map.on("error", (e) => {
      // 圖磚載入錯誤只記錄，唔切降級（地圖本身仲用得）
      console.warn("[map] error:", e.error?.message ?? e);
    });

    // iOS Safari 會喺 WebGL context 太多時殺最舊嗰個，地圖 canvas 即凍結
    // （畫面停格、撥極唔郁）——監聽 context lost 自動重建成個地圖自我修復
    const canvas = map.getCanvas();
    const onCtxLost = (e: Event) => {
      e.preventDefault();
      console.warn("[map] webgl context lost — rebuilding map");
      setMapEpoch((n) => n + 1);
    };
    canvas.addEventListener("webglcontextlost", onCtxLost);

    // 地圖「真正畫過」嘅時間戳：用 MapLibre 自己嘅 render 事件，唔好借精靈 rAF
    // （精靈 loop 同地圖 canvas 係兩條獨立線，地圖凍結時精靈可能照郁，
    //  借佢計時會令睇門狗以為冇事——正正係之前接唔到 soft freeze 嘅盲點）
    let lastMapRenderAt = performance.now();
    map.on("render", () => {
      lastMapRenderAt = performance.now();
    });

    // iOS 由背景切返嚟／重新聚焦：MapLibre 內部渲染 loop 可能停咗，
    // resize + triggerRepaint 係標準解凍手法，通常一 call 即翻生
    const thaw = () => {
      if (document.visibilityState !== "visible") return;
      try {
        map.resize();
        map.triggerRepaint();
        lastMapRenderAt = performance.now();
      } catch (err) {
        console.warn("[map] thaw failed:", err);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") thaw();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", thaw);
    window.addEventListener("focus", thaw);

    // 電影式開場：飛入牛車水／麥士威據點群，拉起 55° 傾角露出 3D 建築
    const INTRO_TARGET: [number, number] = [103.8455, 1.2835];
    map.once("load", () => {
      map.flyTo({
        center: playerPosRef.current ?? INTRO_TARGET,
        zoom: 14,
        pitch: 0,
        bearing: -12,
        duration: 3200,
        essential: true,
      });
    });

    markerEls.current = {};
    const badgeScalers: HTMLDivElement[] = [];
    // 野生精靈生成：每個據點 1 公里內 10 隻（海上/山上會被 isOnLand 過濾）
    const wanderers: Wanderer[] = [];
    const SPAWN_RADIUS_M = 1000;

    // ── 後台覆蓋層（精靈開關/權重、據點開關/spawnPool）──
    // async IIFE：等 config 到先落 marker／生成；後續 tick / assignRoads 閉包引用
    // 同一個 wanderers/badgeScalers 陣列，遲啲加入一樣睇到。
    void (async () => {
      const cfg = await getGameConfig().catch(() => null);
      const spiritOn = (id: string) => cfg?.spirits[id]?.active !== false;
      const spiritWeight = (id: string) => {
        const w = cfg?.spirits[id]?.weight ?? 1;
        return Math.max(0, Math.min(10, Math.floor(w)));
      };
      const centres = HAWKER_CENTRES.filter((c) => cfg?.centres[c.id]?.active !== false);

      for (const centre of centres) {
        const { wrap, scaler, el } = makeMarkerElement(centre);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          sfxTap();
          // 揀中彈跳一下
          el.classList.remove("marker-pop");
          void el.offsetWidth; // 重觸發動畫
          el.classList.add("marker-pop");
          setSelected(centre);
          map.flyTo({ center: [centre.lng, centre.lat], zoom: 16.2, pitch: 0, duration: 1400 });
        });
        markerEls.current[centre.id] = el;
        badgeScalers.push(scaler);
        new maplibregl.Marker({ element: wrap, anchor: "center" })
          .setLngLat([centre.lng, centre.lat])
          .addTo(map);
      }

      const basicSpirits = SPECIES.filter(
        (s) => s.rarity === "basic" && s.stage === 1 && spiritOn(s.id)
      ).map((s) => s.id);

      for (const centre of centres) {
        const checkedIn = store.todayCheckinCount(centre.id) > 0;
        // 後台可覆蓋 spawnPool（null = 用 centres.ts 預設）
        const cfgPool = cfg?.centres[centre.id]?.spawnPool ?? centre.spawnPool;

        // 構建該據點的生成池：基礎原料 + 一階系列（過濾後台停用嘅精靈）
        const stage1Pool = cfgPool
          .map((id) => SPECIES_MAP[id])
          .filter((sp) => sp && sp.stage === 1 && sp.rarity !== "basic" && spiritOn(sp.id))
          .map((sp) => sp.id);
        const pool = [...basicSpirits, ...stage1Pool];

        // 打卡後加入二階精靈（跟隨覆蓋池的一階進化）
        const stage2Pool = checkedIn
          ? SPECIES.filter((sp) => {
              if (sp.stage !== 2 || !spiritOn(sp.id)) return false;
              return cfgPool.some((poolId) => {
                const poolSp = SPECIES_MAP[poolId];
                return poolSp && poolSp.evolvesTo === sp.id;
              });
            }).map((sp) => sp.id)
          : [];

        // 權重：池內重複 weight 次（0 = 唔出；1 = 原本 uniform random）
        // 二階另用獨立機率：打卡後每隻生成先擲 5% 抽二階（抽唔中先落返一階/基礎池）
        const STAGE2_SPAWN_CHANCE = 0.05;
        const weighted: string[] = [];
        for (const id of pool) {
          for (let i = 0; i < spiritWeight(id); i++) weighted.push(id);
        }
        const stage2Weighted: string[] = [];
        for (const id of stage2Pool) {
          for (let i = 0; i < spiritWeight(id); i++) stage2Weighted.push(id);
        }
        if (weighted.length === 0 && stage2Weighted.length === 0) continue;

        // 每據點 10 隻
        for (let i = 0; i < 10; i++) {
          let speciesId: string;
          if (stage2Weighted.length > 0 && Math.random() < STAGE2_SPAWN_CHANCE) {
            speciesId = stage2Weighted[Math.floor(Math.random() * stage2Weighted.length)];
          } else if (weighted.length > 0) {
            speciesId = weighted[Math.floor(Math.random() * weighted.length)];
          } else {
            speciesId = stage2Weighted[Math.floor(Math.random() * stage2Weighted.length)];
          }
          const sp = SPECIES_MAP[speciesId];
          if (!sp) continue;
          const title = `${sp.name[locale]} · ${t("map.catchIt")}`;
          const base = randomNear([centre.lng, centre.lat], SPAWN_RADIUS_M);
          const catchWild = (sid: string, spiritPos: [number, number]) => {
            if (playerPosRef.current) {
              const dist = distanceM(playerPosRef.current[1], playerPosRef.current[0], spiritPos[1], spiritPos[0]);
              if (dist > 500) {
                sfxTap();
                setToast(`太遠了！距離 ${Math.round(dist)} 米，需在 500 米內才能捕捉`);
                return;
              }
            }
            sfxTap();
            router.push(`/capture?species=${sid}&centre=${centre.id}`);
          };
          wanderers.push(makeWanderer(map, speciesId, base, title, catchWild));
        }
      }
    })();

    // ── 主角 avatar：3D 人物模型（player-avatar.glb 骨架動作，經 Avatar3D portal 掛入）──
    const avatarRoot = document.createElement("div");
    // 同 wanderer 一樣：唔落 position，留返俾 maplibre .maplibregl-marker{position:absolute} 控制
    avatarRoot.style.cssText = "width:80px;height:80px;pointer-events:none;overflow:visible;z-index:5";
    const avatarScaler = document.createElement("div");
    avatarScaler.style.cssText = "position:absolute;inset:0;overflow:visible;transform-origin:50% 100%";
    const avatarShadow = document.createElement("div");
    avatarShadow.className = "spirit-shadow";
    avatarShadow.style.cssText =
      "position:absolute;bottom:2px;left:25px;width:30px;height:9px;border-radius:9999px;background:rgba(74,44,20,.45)";
    // 3D 掛載點（React portal 目標）；取代舊 2D player-avatar.png
    const avatarHost = document.createElement("div");
    avatarHost.style.cssText = "position:absolute;inset:0;overflow:visible";
    avatarScaler.append(avatarShadow, avatarHost);
    avatarRoot.appendChild(avatarScaler);
    playerScalerRef.current = avatarScaler;
    avatarHostRef.current = avatarHost;
    // setState 移出 effect 同步段（react-hooks/set-state-in-effect）：microtask 觸發 render
    void Promise.resolve().then(() => setAvatarHost(avatarHost));
    // 未有 GPS 之前主角先企喺開場目的地（等佢一開始就喺畫面度）
    playerAnim.current.cur = [INTRO_TARGET[0], INTRO_TARGET[1]];
    playerMarkerRef.current = new maplibregl.Marker({ element: avatarRoot, anchor: "bottom" })
      .setLngLat(INTRO_TARGET)
      .addTo(map);

    let raf = 0;
    let prevNow = performance.now();
    const tick = (now: number) => {
      // dt 封頂 100ms：切 tab 返嚟／卡幀後唔好一次過爆衝一大段
      const dt = Math.min(100, now - prevNow);
      prevNow = now;
      // try/catch：一幀出錯唔可以殺死成個 loop（否則全部精靈永久停格）
      try {
        for (const w of wanderers) {
          if (w.pressed) continue; // 手指撳住：凍結喺原地，放手即接返路徑
          if (now < w.restUntil) continue; // 到路口小休中
          if (w.path.length < 2) continue;
          // 沿路徑行：逐段消耗今幀嘅步行距離（米），行到頂點就轉下一段
          let budget = w.speed * (dt / 1000);
          let guard = 0;
          while (budget > 0 && guard++ < 64) {
            const to = w.path[w.target];
            if (!to) {
              // 到路徑末端：折返，喺路口停一停
              w.dir = (w.dir === 1 ? -1 : 1) as 1 | -1;
              w.target = w.i + w.dir;
              w.restUntil = now + 500 + Math.random() * 1200;
              break;
            }
            // 面向移動方向（向西行就水平翻轉）
            w.img.style.scale = to[0] < w.pos[0] ? "-1 1" : "1 1";
            const d = metersBetween(w.pos, to);
            if (d <= budget) {
              // 行到今段目標頂點：對齊，前進 index
              w.pos = [to[0], to[1]];
              budget -= d;
              w.i = w.target;
              let nt = w.i + w.dir;
              if (nt < 0 || nt >= w.path.length) {
                // 撞到端點：折返
                w.dir = (w.dir === 1 ? -1 : 1) as 1 | -1;
                nt = w.i + w.dir;
                w.restUntil = now + 500 + Math.random() * 1200;
                w.target = nt;
                break;
              }
              w.target = nt;
            } else {
              // 段內插值前進
              const k = budget / d;
              w.pos = [w.pos[0] + (to[0] - w.pos[0]) * k, w.pos[1] + (to[1] - w.pos[1]) * k];
              budget = 0;
            }
          }
          w.marker.setLngLat(w.pos);
        }
      } catch (err) {
        console.warn("[map] wanderer tick error:", err);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // ── snap 落真實道路：tiles 落齊（idle）後，將每隻野生精靈放上據點附近街道折線 ──
    // 每個據點只查一次路網（memoize）；查唔到路（罕見）就保留 fallback 圓圈路徑。
    let roadsAssigned = false;
    // 每個據點揀出「最近 N 條」候選街道（memoize），同一據點嘅精靈輪流分配唔同街道避免疊埋
    const roadCache = new Map<string, [number, number][][]>();
    const roadCursor = new Map<string, number>();
    const nearbyRoads = (base: [number, number]): [number, number][][] => {
      const key = `${base[0]},${base[1]}`;
      let cand = roadCache.get(key);
      if (!cand) {
        const lines = roadsNear(map, base, 240).filter((l) => l.length >= 2);
        // 按「中點離據點距離」排序，只保留最近 8 條（唔好揀到成條主幹路走去天腳底）
        lines.sort(
          (a, b) =>
            metersBetween(base, a[Math.floor(a.length / 2)]) -
            metersBetween(base, b[Math.floor(b.length / 2)])
        );
        cand = lines.slice(0, 8);
        roadCache.set(key, cand);
      }
      return cand;
    };
    const assignRoads = () => {
      if (roadsAssigned) return;
      let anyOk = false;
      for (const w of wanderers) {
        if (w.onRoad) continue;
        // 陸地檢查：海上/水面的精靈永久隱藏
        if (!isOnLand(map, w.base[0], w.base[1])) {
          w.onRoad = true; // 標記為已處理，不再重試
          w.hidden = true; // 永久隱藏標記
          w.scaler.style.opacity = "0";
          w.hit.style.pointerEvents = "none";
          continue;
        }
        const key = `${w.base[0]},${w.base[1]}`;
        const cand = nearbyRoads(w.base);
        if (!cand.length) continue;
        // 輪流揀街道：同據點下一隻用下一條，散開唔重疊
        const ci = roadCursor.get(key) ?? 0;
        roadCursor.set(key, ci + 1);
        const line = cand[ci % cand.length];
        // 揀路上離 base 最近嘅頂點，裁一段 ~200m 步行窗
        let si = 0;
        let sd = Infinity;
        line.forEach((c, idx) => {
          const d = metersBetween(w.base, c);
          if (d < sd) {
            sd = d;
            si = idx;
          }
        });
        const win = windowPath(line, si, 200);
        if (win.path.length < 2) continue;
        w.path = win.path;
        // 隨機起點頂點 + 隨機方向：即使幾隻分到同一條路都散開喺沿線唔同位
        w.i = Math.floor(Math.random() * win.path.length);
        w.pos = [win.path[w.i][0], win.path[w.i][1]];
        w.dir = Math.random() < 0.5 ? 1 : -1;
        w.target = w.i + w.dir;
        if (w.target < 0 || w.target >= win.path.length) {
          w.dir = (w.dir === 1 ? -1 : 1) as 1 | -1;
          w.target = w.i + w.dir;
        }
        w.restUntil = performance.now() + Math.random() * 1500;
        w.onRoad = true;
        w.marker.setLngLat(w.pos);
        anyOk = true;
      }
      // 全部上到路先收工；仲有 fallback 嘅（tiles 未夠）留返下次 idle 再試
      if (anyOk && wanderers.every((w) => w.onRoad)) roadsAssigned = true;
    };
    map.on("idle", assignRoads);

    // 地圖渲染睇門狗：頁面可見但地圖超過 3 秒冇畫過新一幀（＝凍結）就階梯式自救——
    // 先試平嘅 resize+triggerRepaint 解凍；若果 repaint 後仲係停就重建成個地圖（貴，最後手段）。
    // setInterval 唔受 rAF／地圖渲染停擺影響，所以做得到裁判。
    let repaintTriedAt = 0;
    const watchdog = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const stale = performance.now() - lastMapRenderAt;
      if (stale <= 3000) return;
      // 距離上次試 repaint 未夠 2.5 秒就等多陣，睇 repaint 有冇救返
      if (performance.now() - repaintTriedAt < 2500) return;
      if (repaintTriedAt === 0 || performance.now() - repaintTriedAt < 6000) {
        repaintTriedAt = performance.now();
        console.warn("[map] render stalled >3s — trying repaint");
        thaw();
        return;
      }
      // repaint 都救唔返：重建（session 內設上限，避免極端情況無限重建）
      if (watchdogRebuilds.current < 3) {
        watchdogRebuilds.current += 1;
        console.warn("[map] repaint failed — rebuilding map");
        setMapEpoch((n) => n + 1);
      }
    }, 1500);

    // marker 同步：可見性 + 按 zoom 縮放（與地圖比例同步）
    // zoom 14（2km）時：精靈 = 0.5×（原大小的50%）、定位標記 = 1.0×（avatar root 已加大）
    const BASE_ZOOM = 14;
    const worldScale = (z: number, min = 0.15, max = 4): number =>
      Math.min(max, Math.max(min, Math.pow(2, z - BASE_ZOOM)));
    const syncWorldScale = () => {
      const zoom = map.getZoom();
      const sp = worldScale(zoom);
      const visible = zoom >= 12;
      for (const w of wanderers) {
        if (w.hidden) continue; // 海上精靈保持隱藏
        w.scaler.style.opacity = visible ? "1" : "0";
        w.scaler.style.transform = `scale(${(sp * 0.5).toFixed(3)})`;
        w.hit.style.pointerEvents = visible ? "auto" : "none";
      }
      // 據點圖示固定大小（80px），不跟地圖縮放
      const ps = playerScalerRef.current;
      if (ps) ps.style.transform = `scale(${worldScale(zoom, 0.25, 2).toFixed(3)})`;
    };
    map.on("zoomend", syncWorldScale);
    syncWorldScale();

    // pitch 固定 0 — 不需要 moveend 動態調整傾角

    // 防容器 0 高度初始化：尺寸變動即 resize
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainer.current);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(playerAnim.current.raf);
      window.clearInterval(watchdog);
      canvas.removeEventListener("webglcontextlost", onCtxLost);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", thaw);
      window.removeEventListener("focus", thaw);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      playerMarkerRef.current = null;
      playerScalerRef.current = null;
      avatarHostRef.current = null;
      playerPosRef.current = null;
      markerEls.current = {};
    };
    // mapEpoch：context lost／rAF 停擺時 +1，成個地圖拆咗重起
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEpoch]);

  // 據點徽章三態（金脈衝 / 藍環已打卡 / 灰上限）—— 直接用 marker refs
  useEffect(() => {
    for (const centre of HAWKER_CENTRES) {
      const el = markerEls.current[centre.id];
      if (!el) continue;
      const count = store.todayCheckinCount(centre.id);
      el.classList.remove("pulse-gold", "pulse-blue");
      if (count >= centre.dailyCheckinLimit) {
        el.style.filter = "grayscale(1) opacity(0.7)";
      } else if (count > 0) {
        el.style.filter = "";
        el.classList.add("pulse-blue");
      } else {
        el.style.filter = "";
        el.classList.add("pulse-gold");
      }
    }
  }, [store, store.checkins.length, mapFailed]);

  // 玩家定位
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError(true);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(false);
        setPlayerPos([pos.coords.longitude, pos.coords.latitude]);
      },
      () => setGeoError(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 主角行路：GPS 更新時平滑步行過去（唔跳格），面向移動方向；首次定位鏡頭飛去主角
  useEffect(() => {
    const map = mapRef.current;
    const marker = playerMarkerRef.current;
    if (!map || !marker || !playerPos) return;
    const firstFix = playerPosRef.current === null;
    playerPosRef.current = playerPos;
    cancelAnimationFrame(playerAnim.current.raf);

    if (firstFix) {
      playerAnim.current.cur = [playerPos[0], playerPos[1]];
      marker.setLngLat(playerPos);
      map.flyTo({ center: playerPos, zoom: 16.2, pitch: 0, duration: 2400, essential: true });
      return;
    }

    const from: [number, number] = [playerAnim.current.cur[0], playerAnim.current.cur[1]];
    const to = playerPos;
    // 面向移動方向（向西行水平鏡像）：寫喺 scaler 上（3D 模型喺 portal 內，翻轉容器最穩）
    const ps = playerScalerRef.current;
    if (ps && Math.abs(to[0] - from[0]) > 1e-7) {
      ps.style.scale = to[0] < from[0] ? "-1 1" : "1 1";
    }
    const start = performance.now();
    const dur = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const k = t * t * (3 - 2 * t);
      const cur: [number, number] = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
      playerAnim.current.cur = cur;
      marker.setLngLat(cur);
      if (t < 1) playerAnim.current.raf = requestAnimationFrame(step);
    };
    playerAnim.current.raf = requestAnimationFrame(step);
  }, [playerPos]);

  const locateMe = useCallback(() => {
    if (playerPos && mapRef.current) {
      mapRef.current.flyTo({ center: playerPos, zoom: 16.4, pitch: 0, duration: 1400 });
    }
  }, [playerPos]);

  const distTo = useCallback(
    (centre: HawkerCentre) =>
      playerPos ? distanceM(playerPos[1], playerPos[0], centre.lat, centre.lng) : null,
    [playerPos]
  );

  const selectedDistance = selected ? distTo(selected) : null;
  const selectedCheckins = selected ? store.todayCheckinCount(selected.id) : 0;
  const limitReached = selected ? selectedCheckins >= selected.dailyCheckinLimit : false;
  const cooldownMs = selected ? store.checkinCooldownRemainingMs(selected.id) : 0;
  const onCooldown = !limitReached && cooldownMs > 0;
  const checkinBlocked = limitReached || onCooldown;

  return (
    <main className="relative flex min-h-dvh flex-col">
      {/* 3D 主角 avatar：portal 掛入地圖 marker DOM（avatarHost 由 init effect 建立；epoch 重建會換新 DOM） */}
      {avatarHost && createPortal(<Avatar3D key={mapEpoch} />, avatarHost)}
      {/* 頂部導航欄 */}
      <GameHeader />

      {/* 地圖 / 降級列表 */}
      <div className="relative flex-1">
        {mapFailed === null ? (
          <>
            {/* 外層定尺寸；內層俾 maplibre（佢會覆寫 position，唔可以直接用 absolute inset-0） */}
            <div className="absolute inset-0">
              <div ref={mapContainer} className="h-full w-full" />
            </div>
            {/* 羊皮紙質感疊層：紙紋 + 暗角（multiply 溶入地圖） */}
            <div className="map-parchment-overlay pointer-events-none absolute inset-0 z-10" />
            {/* 羅盤玫瑰裝飾 */}
            <svg
              viewBox="0 0 100 100"
              className="pointer-events-none absolute right-3 top-3 z-10 h-16 w-16 opacity-55"
              aria-hidden
            >
              <circle cx="50" cy="50" r="46" fill="none" stroke="#5e8474" strokeWidth="2" />
              <circle cx="50" cy="50" r="36" fill="none" stroke="#5e8474" strokeWidth="0.8" />
              <path d="M50 6 L56 44 L50 50 L44 44 Z" fill="#b03a2e" />
              <path d="M50 94 L56 56 L50 50 L44 56 Z" fill="#5e8474" />
              <path d="M6 50 L44 44 L50 50 L44 56 Z" fill="#5e8474" />
              <path d="M94 50 L56 44 L50 50 L56 56 Z" fill="#5e8474" />
              <text x="50" y="20" textAnchor="middle" fontSize="13" fontWeight="900" fill="#4a2c14">
                N
              </text>
            </svg>
            {geoError && !store.devMode && (
              <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-chilli px-4 py-1.5 text-xs font-bold text-white shadow">
                <UIIcon name="pin" size={14} /> {t("map.tooFar")}
              </div>
            )}
            <button
              onClick={locateMe}
              className="absolute bottom-28 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full card-parchment"
              aria-label={t("map.locateMe")}
            >
              <UIIcon name="target" size={26} />
            </button>
          </>
        ) : (
          /* 非地圖降級模式：據點列表（唔靠 WebGL，全部功能照用） */
          <div className="paper-texture absolute inset-0 overflow-y-auto px-4 pb-[calc(6rem_+_env(safe-area-inset-bottom))] pt-3">
            <div className="mx-auto max-w-md">
              <div className="mb-3 rounded-xl bg-chilli/90 px-4 py-2 text-center text-xs font-bold text-white">
                {t("map.noWebGL")}
              </div>
              <div className="flex flex-col gap-3">
                {HAWKER_CENTRES.filter((c) => !inactiveCentres.has(c.id)).map((centre) => {
                  const d = distTo(centre);
                  const count = store.todayCheckinCount(centre.id);
                  const full = count >= centre.dailyCheckinLimit;
                  return (
                    <button
                      key={centre.id}
                      onClick={() => {
                        sfxTap();
                        setSelected(centre);
                      }}
                      className={`card-parchment flex items-center gap-3 p-4 text-left ${
                        full ? "opacity-60" : ""
                      }`}
                    >
                      <span
                        className={`shrink-0 ${
                          full ? "grayscale" : count > 0 ? "pulse-blue" : "pulse-gold"
                        } rounded-full`}
                      >
                        <SpiritIcon speciesId={centre.featuredSpeciesId} size={48} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-black text-ink">
                          {centre.name[locale]}
                        </span>
                        <span className="block text-xs text-ink-soft">
                          {centre.district[locale]}
                          {d !== null && ` · ${formatDistance(d)}`}
                        </span>
                      </span>
                      <ElementBadge element={centre.element} size="sm" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 音效/音樂開關（兩種模式都顯示） */}
        <button
          onClick={() => {
            const next = !soundOn;
            setMuted(!next);
            setMusicMuted(!next);
            setSoundOn(next);
            if (next) {
              sfxTap();
              playMusic("map");
            }
          }}
          className="absolute left-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full card-parchment"
          aria-label="sound"
          data-no-press-sfx
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
            {soundOn ? (
              <>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
              </>
            ) : (
              <>
                <line x1="16" y1="9" x2="22" y2="15" />
                <line x1="22" y1="9" x2="16" y2="15" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* 據點資訊卡 bottom sheet */}
      {selected && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 slide-up"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto max-w-md rounded-t-3xl card-parchment border-b-0 p-5 pb-8">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-black text-ink">{selected.name[locale]}</h2>
                <p className="text-xs text-ink-soft">{selected.district[locale]}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full px-2 text-xl text-ink-soft"
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <ElementBadge element={selected.element} />
              <span className="text-xs font-bold text-ink-soft">
                {t("map.hunters")}: {mockHunters(selected.id)}
              </span>
              {selectedDistance !== null && (
                <span className="text-xs font-bold text-ink-soft">
                  {t("map.distance")}: {formatDistance(selectedDistance)}
                </span>
              )}
            </div>

            <div className="mb-3">
              <div className="mb-1 text-xs font-bold text-ink-soft">{t("map.todaySpirits")}</div>
              <div className="flex gap-2">
                {selected.spawnPool.map((id) => (
                  <div key={id} className="flex flex-col items-center gap-0.5">
                    <SpiritIcon
                      speciesId={id}
                      size={44}
                      silhouette={!store.captureCounts[id] && !store.unlockedSilhouettes.includes(id)}
                    />
                    <span className="text-[10px] text-ink-soft">
                      {store.captureCounts[id] ? SPECIES_MAP[id].name[locale] : t("dex.unknown")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-3 text-xs font-bold text-ink-soft">
              {limitReached
                ? t("map.limitReached")
                : onCooldown
                  ? t("map.cooldownLeft", {
                      minutes: Math.max(1, Math.ceil(cooldownMs / 60_000)),
                    })
                  : t("map.checkinsLeft", {
                      count: selected.dailyCheckinLimit - selectedCheckins,
                    })}
            </div>

            <div className="flex gap-2">
              {/* 「帶我去」留喺 app 內：飛鏡頭去據點＋收起卡片，玩家自己睇住地圖行。
                  （以前係開新分頁去 Google Maps，會拋玩家出遊戲。） */}
              <button
                onClick={() => {
                  sfxTap();
                  mapRef.current?.flyTo({
                    center: [selected.lng, selected.lat],
                    zoom: 16.8,
                    pitch: 0,
                    duration: 1400,
                    essential: true,
                  });
                  setSelected(null);
                }}
                className="btn-outline flex flex-1 items-center justify-center gap-1 py-3 text-center text-sm font-bold"
              >
                <UIIcon name="compass" size={18} /> {t("map.navigate")}
              </button>
              <button
                onClick={() => {
                  sfxTap();
                  store.toggleFavourite(selected.id);
                }}
                className="btn-outline px-4 py-3 text-sm font-bold"
              >
                <UIIcon name="star" size={18} dimmed={!store.favouriteCentres.includes(selected.id)} />
              </button>
              {/* 切磋入口已隱藏 */}
              {/* 打卡關卡後移：實體 QR 先係「到場」嘅真證據，所以個掣永遠撳得入掃描頁
                  （唔再用 GPS 距離禁用），淨係打卡次數用晒先 disable。距離喺上面資訊列顯示。 */}
              <button
                disabled={checkinBlocked}
                onClick={() => {
                  sfxTap();
                  router.push(`/checkin?centre=${selected.id}`);
                }}
                className={`flex flex-1 items-center justify-center gap-1 py-3 text-center text-sm font-black ${
                  checkinBlocked ? "btn-outline opacity-50" : "btn-gold"
                }`}
              >
                {!checkinBlocked && <UIIcon name="phone" size={16} />}
                {limitReached
                  ? t("map.limitReached")
                  : onCooldown
                    ? t("map.cooldownLeft", {
                        minutes: Math.max(1, Math.ceil(cooldownMs / 60_000)),
                      })
                    : t("map.scanToCheckin")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-20" />
      {toast && (
        <div
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-ink/95 px-6 py-4 text-center text-sm font-bold text-parchment-light shadow-xl"
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      )}
      <BottomNav />

      {/* 任務按鈕 + 面板 */}
      <MissionButton onClick={() => { sfxTap(); setMissionOpen(true); }} />
      <NotificationBell />
      {missionOpen && (
        <MissionPanel
          missions={[...dailyMissions, ...specialMissions]}
          onClose={() => setMissionOpen(false)}
          onClaim={claimMission}
        />
      )}
    </main>
  );
}
