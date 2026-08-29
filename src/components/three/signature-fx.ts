import * as THREE from "three";
import type { FoodParticleKind } from "@/content/skill-fx";

/**
 * 大招 signature 時間軸：每個 tier 2 技能一條手寫演出，
 * 唔再係「原型放大 1.5 倍」——15 個大招各有視覺主題。
 * 全部用 BattleFx 嘅 pooled 原語（emit/launch/ring/flash/arc），零額外分配。
 */

export interface SigEmitOpts {
  count: number;
  speed?: number;
  size?: number;
  up?: number;
  spread?: number;
  dir?: THREE.Vector3;
  decay?: number;
  food?: FoodParticleKind;
  /** 覆蓋預設技能色 */
  colors?: string[];
}

export interface SigLaunchOpts {
  dur?: number;
  arc?: number;
  size?: number;
  food?: FoodParticleKind;
  color?: string;
  onArrive?: () => void;
}

export interface SigCtx {
  /** 相對秒 → 動作 */
  at: (dt: number, fn: () => void) => void;
  emit: (pos: THREE.Vector3, opts: SigEmitOpts) => void;
  /** dt 時刻由 f 射向 t（內部自動排程） */
  launch: (dt: number, f: THREE.Vector3, t: THREE.Vector3, opts?: SigLaunchOpts) => void;
  ring: (pos: THREE.Vector3, color?: string) => void;
  flash: (pos: THREE.Vector3, color?: string, intensity?: number) => void;
  arc: (pos: THREE.Vector3, opts?: { color?: string; size?: number; spin?: number; rot?: number }) => void;
  /** 施術者胸口位 */
  from: THREE.Vector3;
  /** 對手身位 */
  to: THREE.Vector3;
  /** 施術者前伸手位 */
  hand: THREE.Vector3;
  /** 攻擊方向（XZ 平面單位向量） */
  dir: THREE.Vector3;
  colors: string[];
  food?: FoodParticleKind;
  density: number;
  scale: number;
  crit: boolean;
}

export interface SignatureFx {
  /** 主體命中時刻（頁面結算傷害用，毫秒） */
  impactMs: number;
  build: (ctx: SigCtx) => void;
}

const UP = new THREE.Vector3(0, 1, 0);

/** 對手四周環上一點（水平圓） */
const around = (c: THREE.Vector3, ang: number, r: number, y = 0) =>
  c.clone().add(new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r));

export const SIGNATURE_FX: Record<string, SignatureFx> = {
  // ── 黃金米暴（雞飯）：金米螺旋沖天 → 三波米雨傾瀉 ──
  "golden-rice-storm": {
    impactMs: 900,
    build: (c) => {
      for (let k = 0; k < 10; k++)
        c.at(0.05 * k, () => {
          const p = around(c.from, k * 1.1, 0.28, 0.05 + k * 0.09);
          c.emit(p, { count: 4, speed: 0.3, size: 0.06, up: 0.9, spread: 0.2, dir: UP, food: "grain" });
        });
      c.at(0.5, () => c.flash(c.from, "#ffd700", 20));
      for (let w = 0; w < 3; w++) {
        const t0 = 0.55 + w * 0.18;
        for (let k = 0; k < 4; k++)
          c.launch(t0 + k * 0.03, around(c.to, Math.random() * 6.28, 0.3, 1.1), around(c.to, Math.random() * 6.28, 0.18), {
            dur: 0.2,
            arc: 0.05,
            size: 0.11,
            food: "grain",
          });
        c.at(t0 + 0.28, () => {
          c.emit(c.to, { count: 12, speed: 1.0, size: 0.07, up: 0.35, food: "grain" });
          c.ring(c.to, w === 2 ? "#ffffff" : "#ffd700");
          c.flash(c.to, "#ffd700", 14 + w * 6);
        });
      }
    },
  },

  // ── 香料烈焰（叻沙）：火龍捲——繞對手螺旋升騰嘅辣椒火柱 ──
  "spice-inferno": {
    impactMs: 750,
    build: (c) => {
      for (let k = 0; k < 6; k++)
        c.at(0.1 + k * 0.06, () =>
          c.emit(c.hand, { count: 8, dir: c.dir, spread: 0.28, speed: 2.5, size: 0.08, up: 0.1, decay: 1.5, food: k % 2 === 0 ? "chilli" : undefined })
        );
      for (let k = 0; k < 12; k++)
        c.at(0.45 + k * 0.045, () => {
          const p = around(c.to, k * 1.05, 0.26, 0.02 + k * 0.075);
          c.emit(p, { count: 4, speed: 0.4, size: 0.07, up: 0.85, spread: 0.25, dir: UP, food: k % 3 === 0 ? "chilli" : undefined });
          if (k % 4 === 0) c.flash(p, "#ff6a2a", 10);
        });
      c.at(0.75, () => {
        c.emit(c.to, { count: 20, speed: 1.3, size: 0.08, up: 0.5 });
        c.ring(c.to);
        c.flash(c.to, "#ffd94d", 26);
      });
      c.at(1.0, () => c.ring(c.to, "#ffffff"));
    },
  },

  // ── 蒜頭流星（肉骨茶）：一記巨蒜隕石轟落＋蒜瓣飛濺 ──
  "garlic-meteor": {
    impactMs: 800,
    build: (c) => {
      c.at(0.1, () => c.flash(c.from.clone().setY(c.from.y + 1.1), "#fff2d8", 16));
      c.launch(0.25, c.to.clone().add(new THREE.Vector3(-0.5, 1.5, 0.2)), c.to, { dur: 0.5, arc: 0, size: 0.3, food: "garlic" });
      for (let k = 0; k < 5; k++)
        c.at(0.3 + k * 0.09, () => {
          const p = c.to.clone().add(new THREE.Vector3(-0.4 + k * 0.08, 1.2 - k * 0.22, 0.16 - k * 0.03));
          c.emit(p, { count: 3, speed: 0.3, size: 0.05, decay: 2.6 });
        });
      c.at(0.78, () => {
        c.emit(c.to, { count: 24, speed: 1.4, size: 0.09, up: 0.45, food: "garlic" });
        c.ring(c.to);
        c.flash(c.to, "#ffffff", 30);
      });
      c.at(0.95, () => {
        c.emit(c.to, { count: 12, speed: 1.8, size: 0.06, up: 0.6, food: "garlic" });
        c.ring(c.to, "#ffe0a0");
      });
    },
  },

  // ── 熔岩椰糖漿（糕點）：椰糖噴泉——重漿砸落再噴湧回落 ──
  "gula-melaka-burst": {
    impactMs: 700,
    build: (c) => {
      c.launch(0.15, c.to.clone().add(new THREE.Vector3(0, 1.1, 0)), c.to, { dur: 0.3, arc: 0, size: 0.24, food: "droplet", color: "#c87828" });
      c.at(0.5, () => {
        c.emit(c.to, { count: 18, speed: 0.9, size: 0.08, up: 1.3, spread: 0.3, dir: UP, food: "droplet" });
        c.ring(c.to, "#c87828");
        c.flash(c.to, "#ffb058", 22);
      });
      for (let k = 0; k < 4; k++)
        c.at(0.68 + k * 0.1, () =>
          c.emit(around(c.to, k * 1.6, 0.2, 0.5), { count: 6, speed: 0.5, size: 0.07, up: -0.2, decay: 1.4, food: "droplet" })
        );
      c.at(0.95, () => {
        c.ring(c.to, "#ffb058");
        c.flash(c.to, "#8a4818", 12);
      });
    },
  },

  // ── 翡翠幻火（咖椰）：六朵鬼火環繞收攏 → 內爆 ──
  "phantom-flame": {
    impactMs: 900,
    build: (c) => {
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        c.at(0.1 + k * 0.05, () => {
          const p = around(c.to, ang, 0.5, 0.25);
          c.emit(p, { count: 5, speed: 0.15, size: 0.08, up: 0.1, decay: 1.0 });
          c.flash(p, "#3ee8a0", 8);
        });
        // 收攏：每朵鬼火飛入對手
        c.launch(0.55 + k * 0.04, around(c.to, ang, 0.5, 0.25), c.to, { dur: 0.22, arc: 0.15, size: 0.12, color: "#3ee8a0" });
      }
      c.at(0.9, () => {
        c.emit(c.to, { count: 26, speed: 1.5, size: 0.07, up: 0.4 });
        c.ring(c.to, "#3ee8a0");
        c.flash(c.to, "#a0ffd0", 32);
      });
      c.at(1.05, () => c.ring(c.to, "#ffffff"));
    },
  },

  // ── 辣醬海嘯（辣椒蟹）：三道辣浪由施術者掃向對手 ──
  "chilli-tsunami": {
    impactMs: 850,
    build: (c) => {
      const side = new THREE.Vector3(-c.dir.z, 0, c.dir.x);
      for (let w = 0; w < 3; w++) {
        const t0 = 0.15 + w * 0.24;
        // 一道浪 = 沿路五格逐格湧起
        for (let s = 0; s < 5; s++)
          c.at(t0 + s * 0.05, () => {
            const p = c.from.clone().lerp(c.to, 0.2 + s * 0.2).setY(0.04);
            for (let j = -1; j <= 1; j++)
              c.emit(p.clone().add(side.clone().multiplyScalar(j * 0.14)), {
                count: 3,
                speed: 0.5,
                size: 0.075,
                up: 0.75,
                spread: 0.35,
                dir: UP,
                food: s % 2 === 0 ? "chilli" : "droplet",
              });
          });
        c.at(t0 + 0.3, () => {
          c.emit(c.to, { count: 12, speed: 1.0, size: 0.07, up: 0.4, food: "droplet" });
          c.ring(c.to, w === 2 ? "#ffb088" : "#e83a18");
          c.flash(c.to, "#ff6a2a", 12 + w * 7);
        });
      }
    },
  },

  // ── 百串燎原（沙嗲）：天降沙嗲串交叉彈幕＋扇形火星 ──
  "hundred-skewer-storm": {
    impactMs: 900,
    build: (c) => {
      for (let k = 0; k < 10; k++) {
        const sideOff = (k % 2 === 0 ? 1 : -1) * (0.3 + Math.random() * 0.3);
        const fromP = c.to.clone().add(new THREE.Vector3(sideOff, 1.1 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4));
        c.launch(0.1 + k * 0.07, fromP, around(c.to, Math.random() * 6.28, 0.16), { dur: 0.18, arc: 0, size: 0.13, food: "skewer" });
        c.at(0.3 + k * 0.07, () => c.emit(c.to, { count: 4, speed: 0.9, size: 0.05, up: 0.3 }));
      }
      c.at(0.85, () => {
        // 扇形散射收尾
        for (let j = -2; j <= 2; j++) {
          const d = c.dir.clone().applyAxisAngle(UP, j * 0.4);
          c.emit(c.to, { count: 5, dir: d, spread: 0.2, speed: 1.8, size: 0.06, up: 0.3, food: "skewer" });
        }
        c.ring(c.to);
        c.flash(c.to, "#ffd94d", 28);
      });
    },
  },

  // ── 黑金瀑布（咖啡烏）：對手頭頂垂直咖啡瀑布＋白霧回濺 ──
  "black-gold-waterfall": {
    impactMs: 800,
    build: (c) => {
      c.at(0.1, () => c.flash(c.to.clone().setY(c.to.y + 1.2), "#c89050", 14));
      for (let k = 0; k < 9; k++)
        c.launch(0.2 + k * 0.06, c.to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.16, 1.25, (Math.random() - 0.5) * 0.16)), c.to, {
          dur: 0.16,
          arc: 0,
          size: 0.12,
          food: "droplet",
          color: k % 3 === 2 ? "#ffd700" : "#42280e",
        });
      for (let k = 0; k < 5; k++)
        c.at(0.4 + k * 0.11, () => {
          c.emit(c.to, { count: 8, speed: 0.8, size: 0.07, up: 0.55, spread: 0.5, dir: UP, food: "droplet", colors: ["#42280e", "#c89050"] });
          if (k === 2) c.ring(c.to, "#c89050");
        });
      c.at(0.85, () => {
        c.emit(c.to, { count: 14, speed: 0.5, size: 0.09, up: 0.35, decay: 1.0, colors: ["#f5ead5", "#fffaf0"] }); // 熱氣白霧
        c.ring(c.to, "#ffd700");
        c.flash(c.to, "#ffd700", 26);
      });
    },
  },

  // ── 黑白雙煎（菜頭粿）：黑白交替兩記重砸 → 合璧爆發 ──
  "black-white-duet": {
    impactMs: 850,
    build: (c) => {
      const twin = (t0: number, off: number, col: string) => {
        c.at(t0 - 0.08, () => c.arc(c.to.clone().add(new THREE.Vector3(off, 0.35, 0)), { color: col, size: 0.5, spin: off > 0 ? -9 : 9 }));
        c.launch(t0, c.to.clone().add(new THREE.Vector3(off, 0.95, 0)), around(c.to, off > 0 ? 0 : Math.PI, 0.1), {
          dur: 0.18,
          arc: 0,
          size: 0.2,
          food: "radish",
          color: col,
        });
        c.at(t0 + 0.2, () => {
          c.emit(c.to, { count: 12, speed: 0.9, size: 0.08, up: 0.25, colors: [col, "#c89050"], food: "radish" });
          c.ring(c.to, col);
          c.flash(c.to, col, 16);
        });
      };
      twin(0.15, 0.28, "#42280e"); // 黑煎
      twin(0.45, -0.28, "#fdf6e8"); // 白煎
      c.at(0.85, () => {
        c.emit(c.to, { count: 22, speed: 1.4, size: 0.08, up: 0.5, colors: ["#42280e", "#fdf6e8", "#c89050"] });
        c.ring(c.to, "#ffffff");
        c.flash(c.to, "#ffffff", 30);
      });
    },
  },

  // ── 百味漩渦（囉喏）：水果繞對手螺旋升起 → 內爆吞噬 ──
  "hundred-flavour-vortex": {
    impactMs: 850,
    build: (c) => {
      for (let k = 0; k < 14; k++)
        c.at(0.08 + k * 0.045, () => {
          const p = around(c.to, k * 0.9, 0.42 - k * 0.012, 0.03 + k * 0.055);
          c.emit(p, { count: 3, speed: 0.25, size: 0.075, up: 0.3, spread: 0.3, food: k % 3 === 0 ? "fruit" : k % 3 === 1 ? "peanut" : undefined });
        });
      // 內爆：四方水果飛入
      for (let k = 0; k < 6; k++)
        c.launch(0.62 + k * 0.03, around(c.to, k * 1.05, 0.5, 0.4), c.to, { dur: 0.18, arc: 0.1, size: 0.12, food: "fruit" });
      c.at(0.85, () => {
        c.emit(c.to, { count: 24, speed: 1.5, size: 0.08, up: 0.5, food: "fruit" });
        c.ring(c.to);
        c.flash(c.to, "#ffd94d", 28);
      });
      c.at(1.0, () => c.ring(c.to, "#66d97a"));
    },
  },

  // ── 蛋海狂潮（蠔煎）：兩疊蛋海巨浪推冚對手 ──
  "tidal-omelette": {
    impactMs: 800,
    build: (c) => {
      const side = new THREE.Vector3(-c.dir.z, 0, c.dir.x);
      for (let w = 0; w < 2; w++) {
        const t0 = 0.12 + w * 0.3;
        for (let s = 0; s < 4; s++)
          c.at(t0 + s * 0.06, () => {
            const p = c.from.clone().lerp(c.to, 0.25 + s * 0.22).setY(0.05 + s * 0.1);
            for (let j = -1; j <= 1; j++)
              c.emit(p.clone().add(side.clone().multiplyScalar(j * 0.16)), {
                count: 4,
                speed: 0.6,
                size: 0.085,
                up: 0.6,
                spread: 0.4,
                dir: c.dir,
                food: (s + j) % 2 === 0 ? "egg" : "droplet",
              });
          });
        c.at(t0 + 0.28, () => {
          c.emit(c.to, { count: 14, speed: 1.1, size: 0.08, up: 0.45, food: "egg" });
          c.ring(c.to, w === 1 ? "#ffffff" : "#ffc848");
          c.flash(c.to, "#ffc848", 14 + w * 10);
        });
      }
      c.at(0.95, () => c.emit(c.to, { count: 10, speed: 0.5, size: 0.07, up: 0.5, colors: ["#fff2d8", "#fffaf0"] }));
    },
  },

  // ── 鑊氣爆發（炒粿條）：鑊氣火旋噴流＋餘燼星雨 ──
  "wok-hei-blast": {
    impactMs: 750,
    build: (c) => {
      for (let k = 0; k < 8; k++)
        c.at(0.1 + k * 0.055, () => {
          // 噴流沿途螺旋抖動：火舌有「鑊氣」翻騰感
          const off = new THREE.Vector3(-c.dir.z, 0, c.dir.x).multiplyScalar(Math.sin(k * 1.7) * 0.08);
          c.emit(c.hand.clone().add(off), { count: 8, dir: c.dir, spread: 0.22, speed: 2.7, size: 0.09, up: 0.12, decay: 1.4, food: k % 3 === 0 ? "noodle" : undefined });
          if (k % 2 === 0) c.flash(c.hand.clone().lerp(c.to, k / 8), "#ff6a2a", 8);
        });
      c.at(0.72, () => {
        c.emit(c.to, { count: 24, speed: 1.4, size: 0.08, up: 0.5 });
        c.ring(c.to);
        c.flash(c.to, "#ffd94d", 28);
      });
      // 餘燼星雨
      for (let k = 0; k < 5; k++)
        c.at(0.85 + k * 0.07, () => c.emit(around(c.to, Math.random() * 6.28, 0.25, 0.6), { count: 3, speed: 0.3, size: 0.05, up: -0.1, decay: 1.2 }));
    },
  },

  // ── 千層酥刃（咖喱卜）：交叉弧光刃風暴 ──
  "thousand-layer-blades": {
    impactMs: 800,
    build: (c) => {
      for (let k = 0; k < 6; k++)
        c.at(0.15 + k * 0.09, () => {
          const p = around(c.to, k * 1.5, 0.12, 0.1 + (k % 3) * 0.12);
          c.arc(p, { size: 0.48, spin: (k % 2 === 0 ? 1 : -1) * 11, rot: k * 0.9 });
          c.emit(p, { count: 5, speed: 0.9, size: 0.055, spread: 0.5, decay: 2.2, food: "puff" });
          c.flash(p, "#ffd700", 9);
        });
      c.at(0.78, () => {
        c.arc(c.to, { color: "#ffffff", size: 0.62, spin: 13 });
        c.emit(c.to, { count: 20, speed: 1.5, size: 0.07, up: 0.4, food: "puff" });
        c.ring(c.to);
        c.flash(c.to, "#fff2b0", 28);
      });
    },
  },

  // ── 飛天餅旋風（煎餅）：五塊飛餅軌道下旋 → 齊冚 ──
  "sky-prata-cyclone": {
    impactMs: 850,
    build: (c) => {
      for (let k = 0; k < 5; k++) {
        const ang = k * 1.26;
        // 由高空外圈螺旋收落對手
        c.launch(0.12 + k * 0.1, around(c.to, ang, 0.55, 1.0 - k * 0.1), around(c.to, ang + 2.2, 0.1), {
          dur: 0.3,
          arc: 0.2,
          size: 0.16,
          food: "prata",
        });
        c.at(0.4 + k * 0.1, () => c.emit(c.to, { count: 5, speed: 0.7, size: 0.06, up: 0.3 }));
      }
      c.at(0.82, () => {
        c.emit(c.to, { count: 20, speed: 1.2, size: 0.08, up: 0.45, food: "prata" });
        c.ring(c.to);
        c.flash(c.to, "#ffd894", 26);
      });
      c.at(1.0, () => c.ring(c.to, "#f5e8d0"));
    },
  },

  // ── 翡翠暴雪（煎蕊）：冰晶橫掃暴雪＋冰封白閃 ──
  "emerald-blizzard": {
    impactMs: 800,
    build: (c) => {
      const side = new THREE.Vector3(-c.dir.z, 0, c.dir.x);
      for (let k = 0; k < 7; k++)
        c.at(0.1 + k * 0.06, () => {
          // 暴雪由側面橫掃：發射點沿側向掃過
          const p = c.hand.clone().add(side.clone().multiplyScalar(-0.25 + k * 0.08)).setY(0.35);
          c.emit(p, { count: 7, dir: c.dir, spread: 0.3, speed: 2.4, size: 0.08, up: 0.15, decay: 1.3, food: k % 2 === 0 ? "ice" : "jelly" });
        });
      c.at(0.65, () => {
        // 冰封一刻：全白閃＋冰晶定格
        c.emit(c.to, { count: 16, speed: 0.2, size: 0.09, up: 0.15, decay: 0.9, food: "ice" });
        c.flash(c.to, "#ffffff", 30);
      });
      c.at(0.8, () => {
        c.emit(c.to, { count: 18, speed: 1.4, size: 0.07, up: 0.45, food: "ice" });
        c.ring(c.to, "#d8f0f8");
        c.flash(c.to, "#a0e890", 20);
      });
      c.at(0.98, () => c.ring(c.to, "#ffffff"));
    },
  },
};
