export interface TrickTier {
  readonly at: number;
  readonly mult: number;
  readonly name: string;
}

export interface TrickTuning {
  readonly pts: Readonly<Record<string, number>>;
  readonly variety: number;
  readonly decay: number;
  readonly drainRate: number;
  readonly hitLoss: number;
  readonly tiers: readonly TrickTier[];
}

export interface StyleState {
  readonly combo: number;
  readonly comboTimer: number;
  readonly lastTrick: string;
  readonly mult: number;
  readonly rank: string;
  readonly wavePeak: number;
  readonly runTime: number;
}

export type StyleIntent =
  | Readonly<{ type: "tutorial-mark"; kind: string }>
  | Readonly<{ type: "ghost-capture"; kind: string; x: number; y: number; importance: 1 | 2 | 3 }>
  | Readonly<{ type: "player-trick"; kind: string; at: number }>
  | Readonly<{ type: "rank-up"; rank: string }>
  | Readonly<{ type: "music-rank-changed"; rank: string }>
  | Readonly<{ type: "haptic"; pattern: number | readonly number[] }>
  | Readonly<{ type: "profile-add"; stat: string; amount: number }>
  | Readonly<{ type: "daily-bump"; stat: string; amount: number }>
  | Readonly<{ type: "profile-max"; stat: string; value: number }>
  | Readonly<{ type: "achievement-check" }>;

export interface AddStyleInput {
  readonly kind: string;
  readonly state: StyleState;
  readonly tuning: TrickTuning;
  readonly player: Readonly<{ x: number; y: number }> | null;
  readonly ghostRecording: boolean;
  readonly achievementTracking: boolean;
}

export interface StyleTransition {
  readonly state: StyleState;
  readonly intents: readonly StyleIntent[];
}

const GHOST_BEATS = new Set(["parry", "superslam", "updraft", "slam"]);

export function rankForCombo(combo: number, tiers: readonly TrickTier[]): Readonly<{ mult: number; rank: string }> {
  let mult = 1;
  let rank = "";
  for (const tier of tiers) {
    if (combo >= tier.at) {
      mult = tier.mult;
      rank = tier.name;
    }
  }
  return Object.freeze({ mult, rank });
}

function trackedStyleIntents(kind: string): StyleIntent[] {
  if (kind === "parry") return [
    { type: "profile-add", stat: "parries", amount: 1 },
    { type: "profile-add", stat: "deflects", amount: 1 },
    { type: "daily-bump", stat: "parries", amount: 1 },
    { type: "daily-bump", stat: "deflect", amount: 1 },
  ];
  if (kind === "deflect") return [
    { type: "profile-add", stat: "deflects", amount: 1 },
    { type: "daily-bump", stat: "deflect", amount: 1 },
  ];
  if (kind === "superslam") return [
    { type: "profile-add", stat: "superslams", amount: 1 },
    { type: "daily-bump", stat: "superslam", amount: 1 },
  ];
  if (kind === "updraft") return [
    { type: "profile-add", stat: "updrafts", amount: 1 },
    { type: "daily-bump", stat: "updraft", amount: 1 },
  ];
  if (kind === "throwHit") return [{ type: "profile-add", stat: "throwHits", amount: 1 }];
  return [];
}

export function addStyle(input: AddStyleInput): StyleTransition {
  const intents: StyleIntent[] = [{ type: "tutorial-mark", kind: input.kind }];
  if (input.ghostRecording && GHOST_BEATS.has(input.kind)) {
    intents.push({
      type: "ghost-capture",
      kind: input.kind,
      x: input.player?.x ?? 0,
      y: input.player?.y ?? 0,
      importance: input.kind === "superslam" ? 3 : input.kind === "parry" ? 2 : 1,
    });
  }

  // Preserve the authored fallback: missing and zero-point entries both use the
  // default trick value. The legacy runtime intentionally treated zero as absent.
  const configuredPoints = input.tuning.pts[input.kind];
  const basePoints = configuredPoints === 0 ? 2 : (configuredPoints ?? 2);
  const points = input.kind === input.state.lastTrick ? basePoints : basePoints * input.tuning.variety;
  const combo = input.state.combo + points;
  const nextRank = rankForCombo(combo, input.tuning.tiers);
  const state: StyleState = Object.freeze({
    ...input.state,
    combo,
    comboTimer: input.tuning.decay,
    lastTrick: input.kind,
    mult: nextRank.mult,
    rank: nextRank.rank,
    wavePeak: Math.max(input.state.wavePeak, nextRank.mult),
  });

  if (input.player) intents.push({ type: "player-trick", kind: input.kind, at: input.state.runTime });
  if (state.rank && state.rank !== input.state.rank && state.mult > 1) {
    intents.push({ type: "rank-up", rank: state.rank }, { type: "music-rank-changed", rank: state.rank });
  }
  if (input.kind === "parry") intents.push({ type: "haptic", pattern: 24 });
  else if (input.kind === "superslam") intents.push({ type: "haptic", pattern: [14, 20, 14] });

  if (input.achievementTracking) {
    intents.push(...trackedStyleIntents(input.kind));
    const topName = input.tuning.tiers.at(-1)?.name ?? "";
    if (topName && state.rank === topName) intents.push({ type: "profile-max", stat: "topRank", value: 1 });
    intents.push({ type: "achievement-check" });
  }
  return Object.freeze({ state, intents: Object.freeze(intents) });
}

export function loseStyle(state: StyleState, tuning: TrickTuning): StyleState {
  const combo = state.combo * (1 - tuning.hitLoss);
  const rank = rankForCombo(combo, tuning.tiers);
  return Object.freeze({ ...state, combo, comboTimer: tuning.decay * 0.5, mult: rank.mult, rank: rank.rank });
}

export function updateStyle(state: StyleState, tuning: TrickTuning, dt: number): StyleState {
  if (state.comboTimer > 0) return Object.freeze({ ...state, comboTimer: state.comboTimer - dt });
  if (state.combo <= 0) return state;
  const combo = Math.max(0, state.combo - tuning.drainRate * dt);
  const rank = rankForCombo(combo, tuning.tiers);
  return Object.freeze({
    ...state,
    combo,
    lastTrick: combo === 0 ? "" : state.lastTrick,
    mult: rank.mult,
    rank: rank.rank,
  });
}

export interface TrickColors {
  readonly perfect: string;
  readonly charger: string;
  readonly bomber: string;
}

export function trickColor(multiplier: number, colors: TrickColors): string {
  if (multiplier >= 5) return colors.perfect;
  if (multiplier >= 4) return colors.charger;
  if (multiplier >= 3) return colors.bomber;
  if (multiplier >= 2) return "#caa520";
  return "#888";
}
