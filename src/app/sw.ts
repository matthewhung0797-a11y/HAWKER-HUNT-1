/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 3D 精靈模型：長期快取，離線可用（小販中心室內網絡差）
    {
      matcher: ({ url }) => url.pathname.endsWith(".glb"),
      handler: new CacheFirst({
        cacheName: "spirit-models",
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // 地圖圖磚：快取優先，減少流量並支援弱網
    {
      matcher: ({ url }) =>
        url.hostname.includes("tile") || url.pathname.includes("/tiles/"),
      handler: new CacheFirst({
        cacheName: "map-tiles",
        plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
