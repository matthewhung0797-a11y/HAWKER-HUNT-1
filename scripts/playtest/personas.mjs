/** 數字人 persona 定義（外掛；唔入遊戲邏輯） */
export const PERSONAS = [
  {
    id: "newbie",
    label: "新手小白",
    color: "#3d7fc1",
    /** 由 onboarding 行完整主循環 */
    path: "onboarding",
    tapDelayMs: 90,
    slow: true,
  },
  {
    id: "clumsy",
    label: "手殘玩家",
    color: "#b03a2e",
    path: "capture-first",
    tapDelayMs: 160,
    slow: true,
  },
  {
    id: "speedrun",
    label: "速通黨",
    color: "#e2711d",
    path: "capture-first",
    tapDelayMs: 45,
    slow: false,
  },
  {
    id: "completionist",
    label: "完成主義",
    color: "#4e9a51",
    path: "full-tour",
    tapDelayMs: 70,
    slow: false,
  },
  {
    id: "battler",
    label: "切磋優先",
    color: "#8e5bd1",
    path: "battle-first",
    tapDelayMs: 60,
    slow: false,
  },
];

export function personasByIds(ids) {
  if (!ids?.length) return PERSONAS.slice(0, 3);
  const map = new Map(PERSONAS.map((p) => [p.id, p]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}
