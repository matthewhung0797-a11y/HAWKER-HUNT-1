import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hawker Hunt",
    short_name: "Hawker Hunt",
    description:
      "Turn every hawker centre into your food hunting ground — no download needed, scan and play.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f0e2c4",
    theme_color: "#b03a2e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
