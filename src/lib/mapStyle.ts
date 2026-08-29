import type maplibregl from "maplibre-gl";

/**
 * 「南洋航海圖」自訂 vector 樣式（OpenFreeMap 免費 tiles，OpenMapTiles schema）。
 * 羊皮紙陸地、青玉海水 + 海岸線描邊、墨筆街道、古典 serif 感標籤。
 */

// 調色盤：仿 18 世紀海圖
const SEA = "#a3c3b6";
const SEA_DEEP = "#8fb5a6";
const COAST_INK = "#5e8474";
const LAND = "#eedfba";
const LAND_RESIDENTIAL = "#e7d4a8";
const PARK = "#c5cd97";
const WOOD = "#b4c489";
const SAND = "#e9d9a6";
const BUILDING = "#ddc795";
const BUILDING_LINE = "#c3a670";
const ROAD_CASING = "#f6ecd2";
const ROAD_MINOR = "#c2a878";
const ROAD_MID = "#a8834f";
const ROAD_MAJOR = "#8a6437";
const RAIL = "#b09a72";
const INK = "#4a2c14";
const INK_SOFT = "#7a5a38";
const WATER_LABEL = "#48796b";

export const NAUTICAL_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: "© OpenMapTiles © OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": LAND } },

    // ── 土地覆蓋 ──
    {
      id: "landuse-residential",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["in", "class", "residential", "suburb", "neighbourhood"],
      paint: { "fill-color": LAND_RESIDENTIAL, "fill-opacity": 0.55 },
    },
    {
      id: "landcover-wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", "class", "wood"],
      paint: { "fill-color": WOOD, "fill-opacity": 0.6 },
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", "class", "grass"],
      paint: { "fill-color": PARK, "fill-opacity": 0.55 },
    },
    {
      id: "landcover-sand",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", "class", "sand"],
      paint: { "fill-color": SAND },
    },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": PARK, "fill-opacity": 0.65 },
    },
    {
      id: "park-outline",
      type: "line",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "line-color": "#9aa96e", "line-width": 0.8, "line-dasharray": [3, 2] },
    },

    // ── 水體（海洋 + 河流）──
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": SEA_DEEP,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 2.2, 18, 5],
      },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: {
        "fill-color": ["interpolate", ["linear"], ["zoom"], 10, SEA, 16, SEA_DEEP],
      },
    },
    // 海岸線描邊（雙線 = 古海圖 hachure 感）
    {
      id: "coastline-outer",
      type: "line",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "line-color": COAST_INK, "line-width": 1.6, "line-opacity": 0.85 },
    },
    {
      id: "coastline-inner",
      type: "line",
      source: "openmaptiles",
      "source-layer": "water",
      paint: {
        "line-color": COAST_INK,
        "line-width": 4.5,
        "line-opacity": 0.16,
        "line-offset": 2.5,
      },
    },

    // ── 建築（3D 立體擠出，Pokémon GO 感；高 zoom 先出現）──
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13.5,
      maxzoom: 14.8,
      paint: {
        "fill-color": BUILDING,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 14.5, 0.6],
        "fill-outline-color": BUILDING_LINE,
      },
    },
    {
      id: "building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14.5,
      paint: {
        // 陽光向：頂面淺、側面隨高度加深，營造手繪積木感
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "render_height"], 8],
          0,
          BUILDING,
          60,
          "#c9ab72",
          150,
          "#b8954f",
        ],
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14.5,
          0,
          15.8,
          ["coalesce", ["get", "render_height"], 10],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14.5,
          0,
          15.8,
          ["coalesce", ["get", "render_min_height"], 0],
        ],
        "fill-extrusion-opacity": 0.88,
        "fill-extrusion-vertical-gradient": true,
      },
    },

    // ── 道路（墨筆風：奶白 casing + 啡墨芯線）──
    {
      id: "road-path",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["in", "class", "path", "pedestrian"],
      paint: {
        "line-color": ROAD_MID,
        "line-width": 1.2,
        "line-dasharray": [2, 2],
        "line-opacity": 0.7,
      },
    },
    {
      id: "road-minor-casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["in", "class", "minor", "service", "track"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_CASING,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 12, 1.5, 15, 4, 18, 12],
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["in", "class", "minor", "service", "track"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_MINOR,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 12, 0.6, 15, 2, 18, 7],
      },
    },
    {
      id: "road-secondary-casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", "class", "secondary", "tertiary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_CASING,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 1.5, 15, 6, 18, 16],
      },
    },
    {
      id: "road-secondary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", "class", "secondary", "tertiary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_MID,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 0.8, 15, 3.2, 18, 10],
      },
    },
    {
      id: "road-primary-casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", "class", "primary", "trunk", "motorway"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_CASING,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 8, 1.8, 15, 8, 18, 20],
      },
    },
    {
      id: "road-primary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", "class", "primary", "trunk", "motorway"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_MAJOR,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 8, 1, 15, 4.5, 18, 13],
      },
    },
    {
      id: "rail",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 13,
      filter: ["==", "class", "rail"],
      paint: { "line-color": RAIL, "line-width": 1.4, "line-dasharray": [4, 3], "line-opacity": 0.6 },
    },

    // ── 標籤 ──
    {
      id: "road-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 13.5,
      layout: {
        "symbol-placement": "line",
        "text-font": ["Noto Sans Regular"],
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13.5, 9.5, 17, 12],
        "text-letter-spacing": 0.05,
      },
      paint: {
        "text-color": INK_SOFT,
        "text-halo-color": ROAD_CASING,
        "text-halo-width": 1.4,
      },
    },
    {
      id: "water-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      layout: {
        "text-font": ["Noto Sans Italic"],
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-size": 13,
        "text-letter-spacing": 0.25,
      },
      paint: {
        "text-color": WATER_LABEL,
        "text-halo-color": SEA,
        "text-halo-width": 1,
      },
    },
    {
      id: "place-suburb",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["in", "class", "suburb", "quarter", "neighbourhood"],
      layout: {
        "text-font": ["Noto Sans Regular"],
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 13],
        "text-letter-spacing": 0.28,
        "text-transform": "uppercase",
      },
      paint: {
        "text-color": INK_SOFT,
        "text-halo-color": LAND,
        "text-halo-width": 1.6,
        "text-opacity": 0.9,
      },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["in", "class", "city", "town"],
      layout: {
        "text-font": ["Noto Sans Bold"],
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 13, 14, 18],
        "text-letter-spacing": 0.15,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": LAND,
        "text-halo-width": 2,
      },
    },
  ],
};
