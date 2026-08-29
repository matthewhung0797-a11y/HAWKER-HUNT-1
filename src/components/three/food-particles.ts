import * as THREE from "three";
import type { FoodParticleKind } from "@/content/skill-fx";

/**
 * 小販美食粒子貼圖庫：全部 Canvas 2D 程序化繪製（無外部資產）。
 * 每個技能用返「真食物」形狀——米粒、麵條、辣椒、蒜頭、糕層、半熟蛋……
 * 本地人一睇就識，突顯 hawker 文化特色。
 */

const SIZE = 96;
const cache = new Map<FoodParticleKind, THREE.CanvasTexture>();

/** 呢啲 kind 繪製成白色底，由技能色 tint（醬汁/湯類乜色都有） */
export const TINTABLE: ReadonlySet<FoodParticleKind> = new Set(["droplet", "coconut"] as FoodParticleKind[]);

type Draw = (ctx: CanvasRenderingContext2D) => void;

const DRAWERS: Record<Exclude<FoodParticleKind, "glow">, Draw> = {
  /** 米粒：飽滿長橢圓，油飯米黃 */
  grain: (ctx) => {
    ctx.rotate(-0.5);
    ctx.fillStyle = "#fff3d4";
    ctx.strokeStyle = "#e0c890";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.ellipse(-8, -4, 10, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 麵條：S 形粗麵，叻沙粗米粉黃 */
  noodle: (ctx) => {
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e8b860";
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(-32, -22);
    ctx.bezierCurveTo(8, -34, -14, 20, 32, 22);
    ctx.stroke();
    ctx.strokeStyle = "#ffe2a0";
    ctx.lineWidth = 7;
    ctx.stroke();
  },

  /** 辣椒：彎身紅椒＋綠蒂 */
  chilli: (ctx) => {
    ctx.rotate(0.6);
    ctx.fillStyle = "#e02818";
    ctx.beginPath();
    ctx.moveTo(-22, -26);
    ctx.quadraticCurveTo(26, -18, 20, 30);
    ctx.quadraticCurveTo(12, 16, -2, 2);
    ctx.quadraticCurveTo(-16, -10, -22, -26);
    ctx.fill();
    ctx.fillStyle = "rgba(255,130,90,.8)";
    ctx.beginPath();
    ctx.ellipse(4, -12, 10, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4e9a51";
    ctx.beginPath();
    ctx.ellipse(-22, -27, 8, 5, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 蒜頭：三瓣白蒜球 */
  garlic: (ctx) => {
    ctx.fillStyle = "#f6efe0";
    ctx.strokeStyle = "#cbb88e";
    ctx.lineWidth = 3.5;
    for (const [dx, r] of [
      [-13, 15],
      [13, 15],
      [0, 18],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(dx, 6, r, r * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = "#b8a070";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.quadraticCurveTo(4, -26, -2, -32);
    ctx.stroke();
  },

  /** 排骨：骨棒兩端圓髻 */
  bone: (ctx) => {
    ctx.rotate(-0.7);
    ctx.fillStyle = "#f2ead6";
    ctx.strokeStyle = "#cfc0a0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-20, -7, 40, 14, 7);
    ctx.fill();
    ctx.stroke();
    for (const [x, y] of [
      [-22, -9],
      [-22, 9],
      [22, -9],
      [22, 9],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  },

  /** 油條：兩條金黃炸棍孖埋 */
  youtiao: (ctx) => {
    ctx.rotate(0.5);
    for (const dy of [-9, 9]) {
      ctx.fillStyle = "#d89a40";
      ctx.strokeStyle = "#a86a20";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(-32, dy - 9, 64, 18, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,220,150,.75)";
      ctx.beginPath();
      ctx.roundRect(-26, dy - 6, 50, 5, 3);
      ctx.fill();
    }
  },

  /** 斑蘭葉：尖長綠葉＋中脈 */
  leaf: (ctx) => {
    ctx.rotate(-0.8);
    const grad = ctx.createLinearGradient(-32, 0, 32, 0);
    grad.addColorStop(0, "#2e7a35");
    grad.addColorStop(1, "#7dd070");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.quadraticCurveTo(0, -20, 34, 0);
    ctx.quadraticCurveTo(0, 20, -34, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(230,255,210,.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.quadraticCurveTo(0, -2, 30, 0);
    ctx.stroke();
  },

  /** 九層糕：粉白相間橫層方塊 */
  kueh: (ctx) => {
    ctx.rotate(0.18);
    const layers = ["#e8608e", "#fdf3ec", "#e8608e", "#fdf3ec", "#e8608e"];
    const h = 52 / layers.length;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-27, -26, 54, 52, 8);
    ctx.clip();
    layers.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(-27, -26 + i * h, 54, h + 1);
    });
    ctx.restore();
    ctx.strokeStyle = "#c8486e";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-27, -26, 54, 52, 8);
    ctx.stroke();
  },

  /** 醬滴：淚珠形（白底，由技能色 tint——薑蓉黃／咖椰綠／椰糖啡通用） */
  droplet: (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.bezierCurveTo(16, -6, 20, 8, 12, 20);
    ctx.arc(0, 14, 17, 0.4, Math.PI - 0.4, false);
    ctx.bezierCurveTo(-20, 8, -16, -6, 0, -30);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.beginPath();
    ctx.ellipse(-6, 8, 5, 9, 0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 半熟蛋：蛋白橢圓＋流心蛋黃 */
  egg: (ctx) => {
    ctx.fillStyle = "#fffdf6";
    ctx.strokeStyle = "#e8ddc0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 24, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffa028";
    ctx.beginPath();
    ctx.arc(4, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.beginPath();
    ctx.arc(-1, -5, 4.5, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 咖椰吐司：金黃方包＋啡脆邊＋咖椰醬 */
  toast: (ctx) => {
    ctx.rotate(-0.2);
    ctx.fillStyle = "#f0c878";
    ctx.strokeStyle = "#a87830";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(-26, -26, 52, 52, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5cb860";
    ctx.beginPath();
    ctx.ellipse(0, 2, 15, 11, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,240,200,.8)";
    ctx.beginPath();
    ctx.roundRect(-20, -21, 40, 7, 4);
    ctx.fill();
  },

  /** 砂鍋：赤陶圓煲＋鍋耳＋蓋钮 */
  claypot: (ctx) => {
    ctx.fillStyle = "#8a5028";
    ctx.strokeStyle = "#5e3418";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, 8, 26, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#a86a3a";
    ctx.beginPath();
    ctx.ellipse(0, -8, 27, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const dx of [-30, 30]) {
      ctx.beginPath();
      ctx.ellipse(dx, -4, 6, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#8a5028";
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#5e3418";
    ctx.beginPath();
    ctx.arc(0, -14, 5, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 椰絲：一撮白絲（白底 tint 得） */
  coconut: (ctx) => {
    ctx.strokeStyle = "#ffffff";
    ctx.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      ctx.lineWidth = 4 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      ctx.quadraticCurveTo(
        Math.cos(a + 0.6) * 20,
        Math.sin(a + 0.6) * 20,
        Math.cos(a + 0.2) * 32,
        Math.sin(a + 0.2) * 32
      );
      ctx.stroke();
    }
  },

  /** 炸饅頭：金黃圓包＋摺紋＋高光 */
  mantou: (ctx) => {
    ctx.fillStyle = "#f0c060";
    ctx.strokeStyle = "#b88030";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 4, 27, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(184,128,48,.55)";
    ctx.lineWidth = 3;
    for (const a of [-0.9, 0, 0.9]) {
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * 16, -2 + Math.abs(a) * 4);
      ctx.quadraticCurveTo(Math.sin(a) * 8, -16, 0, -17);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,240,200,.8)";
    ctx.beginPath();
    ctx.ellipse(-9, -5, 9, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 沙嗲串：竹籤串三嚿燒肉 */
  skewer: (ctx) => {
    ctx.rotate(-0.9);
    ctx.strokeStyle = "#d8b878";
    ctx.lineCap = "round";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(0, 38);
    ctx.stroke();
    for (const dy of [-20, 0, 20]) {
      ctx.fillStyle = "#b06828";
      ctx.strokeStyle = "#7a4014";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-13, dy - 9, 26, 18, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,180,100,.7)";
      ctx.beginPath();
      ctx.roundRect(-9, dy - 6, 12, 5, 3);
      ctx.fill();
    }
  },

  /** 咖啡豆：深焙橢圓＋中線坑 */
  bean: (ctx) => {
    ctx.rotate(0.5);
    ctx.fillStyle = "#5a3a20";
    ctx.strokeStyle = "#3a2410";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#2a1808";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-20, -6);
    ctx.quadraticCurveTo(6, 0, -20, 6);
    ctx.moveTo(-20, -6);
    ctx.quadraticCurveTo(-2, 2, 20, 8);
    ctx.stroke();
    ctx.fillStyle = "rgba(200,150,90,.6)";
    ctx.beginPath();
    ctx.ellipse(8, -8, 8, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 菜頭粿粒：白粿方粒＋煎香焦邊 */
  radish: (ctx) => {
    ctx.rotate(0.25);
    ctx.fillStyle = "#fdf6e8";
    ctx.strokeStyle = "#d8a860";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(-24, -24, 48, 48, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(216,168,96,.5)";
    ctx.beginPath();
    ctx.roundRect(-24, 8, 48, 16, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,200,72,.8)";
    ctx.beginPath();
    ctx.ellipse(8, -10, 8, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 菠蘿角：三角果肉＋格紋 */
  fruit: (ctx) => {
    ctx.rotate(-0.3);
    ctx.fillStyle = "#ffd94d";
    ctx.strokeStyle = "#d8a020";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-26, 22);
    ctx.lineTo(0, -28);
    ctx.lineTo(26, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(216,160,32,.5)";
    ctx.lineWidth = 2.5;
    for (const d of [-10, 2, 14]) {
      ctx.beginPath();
      ctx.moveTo(-26 + (d + 28) * 0.5, d);
      ctx.lineTo(26 - (d + 28) * 0.5, d);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,250,220,.75)";
    ctx.beginPath();
    ctx.ellipse(-4, 2, 6, 10, 0.5, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 花生碎：金黃碎粒簇 */
  peanut: (ctx) => {
    const bits: [number, number, number, number][] = [
      [-14, -8, 10, 0.4],
      [10, -12, 8, -0.6],
      [16, 10, 9, 0.9],
      [-6, 12, 11, -0.2],
      [-22, 8, 7, 0.7],
      [2, -1, 7, 0.1],
    ];
    for (const [x, y, r, rot] of bits) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = "#e8b878";
      ctx.strokeStyle = "#b0804a";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(0, -r * 0.8);
      ctx.lineTo(r * 0.9, -r * 0.2);
      ctx.lineTo(r * 0.5, r * 0.8);
      ctx.lineTo(-r * 0.6, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },

  /** 蠔仔：肥美橢圓蠔肉＋深色裙邊 */
  oyster: (ctx) => {
    ctx.rotate(0.3);
    ctx.fillStyle = "#8a7860";
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0e4cc";
    ctx.beginPath();
    ctx.ellipse(0, -1, 24, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8c8a8";
    ctx.beginPath();
    ctx.ellipse(4, 2, 13, 9, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.beginPath();
    ctx.ellipse(-8, -7, 7, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 酥皮角：半月咖喱卜＋螺旋花邊 */
  puff: (ctx) => {
    ctx.rotate(-0.4);
    ctx.fillStyle = "#f0c060";
    ctx.strokeStyle = "#b88030";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-28, 12);
    ctx.quadraticCurveTo(0, -34, 28, 12);
    ctx.quadraticCurveTo(0, 24, -28, 12);
    ctx.fill();
    ctx.stroke();
    // 花邊摺紋
    ctx.strokeStyle = "rgba(184,128,48,.7)";
    ctx.lineWidth = 3;
    for (const t of [-0.75, -0.35, 0, 0.35, 0.75]) {
      const x = t * 26;
      const y = 12 - Math.abs(t) * 4;
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x * 0.82, y - 6);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,240,200,.75)";
    ctx.beginPath();
    ctx.ellipse(-4, -8, 10, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 煎餅圓盤：金黃圓餅＋摺疊紋＋焦斑 */
  prata: (ctx) => {
    ctx.fillStyle = "#e8c078";
    ctx.strokeStyle = "#b88030";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 26, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(184,128,48,.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 16, 0.15, 0, Math.PI * 2);
    ctx.stroke();
    for (const [x, y, r] of [
      [-12, -8, 4],
      [10, -11, 3],
      [14, 8, 4],
      [-6, 12, 3],
    ] as const) {
      ctx.fillStyle = "rgba(150,90,30,.6)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,240,200,.7)";
    ctx.beginPath();
    ctx.ellipse(-8, -6, 9, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 斑蘭綠蕊：短身彈牙綠粉條 */
  jelly: (ctx) => {
    ctx.lineCap = "round";
    ctx.rotate(0.4);
    ctx.strokeStyle = "#2e8a41";
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(-26, -10);
    ctx.bezierCurveTo(4, -26, -8, 18, 28, 12);
    ctx.stroke();
    ctx.strokeStyle = "#5cc868";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = "rgba(220,255,210,.75)";
    ctx.lineWidth = 4;
    ctx.stroke();
  },

  /** 冰晶：六角雪花冰粒 */
  ice: (ctx) => {
    ctx.strokeStyle = "#cfeef8";
    ctx.lineCap = "round";
    ctx.lineWidth = 6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
      ctx.stroke();
      // 側枝
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
      ctx.lineTo(Math.cos(a + 0.5) * 26, Math.sin(a + 0.5) * 26);
      ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
      ctx.lineTo(Math.cos(a - 0.5) * 26, Math.sin(a - 0.5) * 26);
      ctx.stroke();
      ctx.lineWidth = 6;
    }
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 紅豆：暗紅橢圓豆＋白臍 */
  redbean: (ctx) => {
    ctx.rotate(-0.4);
    ctx.fillStyle = "#8a3030";
    ctx.strokeStyle = "#5e1c1c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f0e0d0";
    ctx.beginPath();
    ctx.ellipse(-14, 0, 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(230,150,150,.65)";
    ctx.beginPath();
    ctx.ellipse(6, -7, 9, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
  },

  /** 胡椒粒：深啡碎粒簇 */
  pepper: (ctx) => {
    const dots: [number, number, number][] = [
      [-12, -10, 9],
      [10, -14, 7],
      [16, 8, 8],
      [-6, 12, 10],
      [-20, 6, 6],
      [2, -2, 6],
    ];
    for (const [x, y, r] of dots) {
      ctx.fillStyle = "#4a3624";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,130,90,.6)";
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

export function getFoodTexture(kind: FoodParticleKind): THREE.CanvasTexture | null {
  if (kind === "glow") return null;
  const hit = cache.get(kind);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  ctx.translate(SIZE / 2, SIZE / 2);
  DRAWERS[kind](ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, tex);
  return tex;
}
