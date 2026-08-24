/**
 * Authored public difficulty values.
 *
 * The catalog is immutable and independent of runtime configuration. The
 * adapter below preserves the historical CONFIG.difficulties shape and
 * returns fresh mutable objects for each game world.
 */

export const DIFFICULTY_IDS = Object.freeze(["easy", "normal", "hard", "extreme", "onehit"] as const);
export type DifficultyId = typeof DIFFICULTY_IDS[number];

export interface DifficultyModifiers {
  enemyHealth: number;
  playerDamageTaken: number;
  enemyCount: number;
  coinReward: number;
  scoreReward: number;
}

export interface DifficultyDefinition {
  id: DifficultyId;
  label: string;
  description: string;
  oneHit: boolean;
  modifiers: Readonly<DifficultyModifiers>;
}

export interface LegacyDifficultyDefinition {
  id: DifficultyId;
  label: string;
  desc: string;
  oneHit?: true;
  mods: {
    hp: number;
    dmg: number;
    count: number;
    coin: number;
    score: number;
  };
}

export const DIFFICULTY_CATALOG = Object.freeze([
  Object.freeze({
    id: "easy",
    label: "Easy",
    description: "Gentler enemies, lighter hits.",
    oneHit: false,
    modifiers: Object.freeze({ enemyHealth: 0.8, playerDamageTaken: 0.65, enemyCount: 0.85, coinReward: 0.8, scoreReward: 0.7 }),
  }),
  Object.freeze({
    id: "normal",
    label: "Normal",
    description: "The intended balance.",
    oneHit: false,
    modifiers: Object.freeze({ enemyHealth: 1, playerDamageTaken: 1, enemyCount: 1, coinReward: 1, scoreReward: 1 }),
  }),
  Object.freeze({
    id: "hard",
    label: "Hard",
    description: "Tougher, hungrier, more of them.",
    oneHit: false,
    modifiers: Object.freeze({ enemyHealth: 1.3, playerDamageTaken: 1.35, enemyCount: 1.15, coinReward: 1.1, scoreReward: 1.4 }),
  }),
  Object.freeze({
    id: "extreme",
    label: "Extreme",
    description: "Brutal — but fair. Big rewards.",
    oneHit: false,
    modifiers: Object.freeze({ enemyHealth: 1.7, playerDamageTaken: 1.8, enemyCount: 1.3, coinReward: 1.15, scoreReward: 2 }),
  }),
  Object.freeze({
    id: "onehit",
    label: "One-Hit",
    description: "One touch and you fall. Rewards surge after wave 8.",
    oneHit: true,
    modifiers: Object.freeze({ enemyHealth: 0.9, playerDamageTaken: 1, enemyCount: 1, coinReward: 0.7, scoreReward: 2.2 }),
  }),
] as const satisfies readonly DifficultyDefinition[]);

if (Object.keys(DIFFICULTY_CATALOG).length !== DIFFICULTY_IDS.length
  || DIFFICULTY_CATALOG.some((difficulty, index) => difficulty.id !== DIFFICULTY_IDS[index])) {
  throw new Error("Difficulty catalog order must match the canonical difficulty IDs");
}

/** Return a fresh mutable CONFIG-compatible difficulty list. */
export function createLegacyDifficulties(): LegacyDifficultyDefinition[] {
  return DIFFICULTY_CATALOG.map((difficulty) => ({
    id: difficulty.id,
    label: difficulty.label,
    desc: difficulty.description,
    ...(difficulty.oneHit ? { oneHit: true as const } : {}),
    mods: {
      hp: difficulty.modifiers.enemyHealth,
      dmg: difficulty.modifiers.playerDamageTaken,
      count: difficulty.modifiers.enemyCount,
      coin: difficulty.modifiers.coinReward,
      score: difficulty.modifiers.scoreReward,
    },
  }));
}
