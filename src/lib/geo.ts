import { HAWKER_CENTRES } from "@/content/centres";
import type { HawkerCentre } from "@/content/types";

/** Haversine 距離（米） */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/** 今日日期字串（新加坡時區） */
export function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

/** 離座標最近嘅小販中心（生產環境跳過 hk-test） */
export function nearestCentre(
  lat: number,
  lng: number,
  opts?: { includeDev?: boolean }
): HawkerCentre {
  const pool = HAWKER_CENTRES.filter(
    (c) => opts?.includeDev || c.id !== "hk-test" || process.env.NODE_ENV === "development"
  );
  let best = pool[0] ?? HAWKER_CENTRES[0];
  let bestD = Infinity;
  for (const c of pool) {
    const d = distanceM(lat, lng, c.lat, c.lng);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
