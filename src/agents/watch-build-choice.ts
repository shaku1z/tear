export type WatchWeaponId = "sword" | "hammer" | "spear" | "chainblade" | "ringblade";

const GENERAL: Readonly<Record<string, number>> = Object.freeze({
  last_stand: 1_125, concussive: 1_100, vitality: 1_075, bulwark: 1_050,
  cinder: 1_025, vampiric: 1_000, tough_hide: 975, riposte: 950, parry_split: 925,
  air_dash: 900, steady_hand: 875, berserk: 850, counterforce: 825,
  long_reach: 800, quick_recovery: 775, tailwind: 750, keen_edge: 725,
  detonate: 700, flow_guard: 675, bloodrite: 650, aegis: 625, fleet: 600,
  hard_turn: 575, adrenaline: 550, air_superiority: 525,
});

const RINGBLADE: Readonly<Record<string, number>> = Object.freeze({
  last_stand: 1_200, concussive: 1_175, bulwark: 1_150, tough_hide: 1_125,
  kinetic: 1_100, vitality: 1_085, air_dash: 1_075, quick_recovery: 1_050,
  boomerang: 1_025, deadly_throw: 1_000, throw_momentum: 975, throw_giant: 950,
  gyroblade: 925, quickdraw: 900, ricochet: 875, vortex_recall: 850,
  storm_recall: 825,
  parry_split: 300, steady_hand: 300, counterforce: 300, wide_guard: 300,
  parry_pierce: 300, keen_edge: 300, heavy_swing: 300, air_superiority: 300,
  vampiric: 250, riposte: 250,
});

export function buildWatchChoiceScore(id: string, weapon: WatchWeaponId): number {
  return (weapon === "ringblade" ? RINGBLADE[id] : GENERAL[id]) ?? GENERAL[id] ?? 300;
}
