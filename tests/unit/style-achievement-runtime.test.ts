import { describe, expect, it } from "vitest";
import {
  addStyle,
  loseStyle,
  rankForCombo,
  trickColor,
  updateStyle,
  type StyleState,
  type TrickTuning,
} from "../../src/gameplay/scoring/style-runtime";
import {
  bossKillIntents,
  breakStaticParry,
  dashDodgeIntents,
  hordeClearIntents,
  killIntents,
  markRevived,
  markStageRestriction,
  parryIntents,
  recordBossHit,
  resetStageRestrictions,
  stageDoneIntents,
  tickAchievementRuntime,
  tracksAchievements,
  type AchievementBoss,
  type AchievementRunState,
} from "../../src/gameplay/progression/achievement-runtime";

const tuning: TrickTuning = {
  pts: { parry: 15, deflect: 8, superslam: 20, updraft: 12, throwHit: 6, slam: 5 },
  variety: 1.5,
  decay: 4,
  drainRate: 10,
  hitLoss: 0.3,
  tiers: [
    { at: 10, mult: 2, name: "COOL" },
    { at: 25, mult: 3, name: "BRUTAL" },
    { at: 50, mult: 5, name: "PERFECT" },
  ],
};

function style(overrides: Partial<StyleState> = {}): StyleState {
  return { combo: 0, comboTimer: 0, lastTrick: "", mult: 1, rank: "", wavePeak: 1, runTime: 12, ...overrides };
}

function intentTypes(intents: readonly { readonly type: string }[]): string[] {
  return intents.map((intent) => intent.type);
}

describe("style runtime", () => {
  it("uses the last satisfied tier in canonical order at every boundary", () => {
    expect([0, 9.999, 10, 24.999, 25, 49.999, 50].map((combo) => rankForCombo(combo, tuning.tiers))).toEqual([
      { mult: 1, rank: "" }, { mult: 1, rank: "" }, { mult: 2, rank: "COOL" },
      { mult: 2, rank: "COOL" }, { mult: 3, rank: "BRUTAL" }, { mult: 3, rank: "BRUTAL" },
      { mult: 5, rank: "PERFECT" },
    ]);
  });

  it.each([
    ["parry", ["parries", "deflects"], ["parries", "deflect"]],
    ["deflect", ["deflects"], ["deflect"]],
    ["superslam", ["superslams"], ["superslam"]],
    ["updraft", ["updrafts"], ["updraft"]],
    ["throwHit", ["throwHits"], []],
    ["slam", [], []],
  ])("preserves %s scoring, profile and daily side effects", (kind, profileStats, dailyStats) => {
    const result = addStyle({ kind, state: style(), tuning, player: { x: 3, y: 4 }, ghostRecording: true, achievementTracking: true });
    expect(result.state.combo).toBe((tuning.pts[kind] ?? 2) * tuning.variety);
    expect(result.state.lastTrick).toBe(kind);
    expect(result.state.comboTimer).toBe(4);
    expect(result.intents.filter((intent) => intent.type === "profile-add").map((intent) => intent.stat)).toEqual(profileStats);
    expect(result.intents.filter((intent) => intent.type === "daily-bump").map((intent) => intent.stat)).toEqual(dailyStats);
    expect(result.intents.at(-1)).toEqual({ type: "achievement-check" });
    expect(result.intents).toContainEqual({ type: "player-trick", kind, at: 12 });
  });

  it("applies variety only when the trick differs and defaults unknown tricks to two points", () => {
    expect(addStyle({ kind: "parry", state: style({ lastTrick: "parry" }), tuning, player: null, ghostRecording: false, achievementTracking: false }).state.combo).toBe(15);
    expect(addStyle({ kind: "unknown", state: style(), tuning, player: null, ghostRecording: false, achievementTracking: false }).state.combo).toBe(3);
    expect(addStyle({ kind: "silent", state: style(), tuning: { ...tuning, pts: { silent: 0 } }, player: null, ghostRecording: false, achievementTracking: false }).state.combo).toBe(3);
  });

  it("emits ghost, rank, music, haptic and top-rank intents at the exact authored beats", () => {
    const parry = addStyle({ kind: "parry", state: style({ combo: 40, rank: "BRUTAL", mult: 3 }), tuning,
      player: null, ghostRecording: true, achievementTracking: true });
    expect(parry.state).toMatchObject({ combo: 62.5, mult: 5, rank: "PERFECT", wavePeak: 5 });
    expect(parry.intents).toContainEqual({ type: "ghost-capture", kind: "parry", x: 0, y: 0, importance: 2 });
    expect(parry.intents).toContainEqual({ type: "rank-up", rank: "PERFECT" });
    expect(parry.intents).toContainEqual({ type: "music-rank-changed", rank: "PERFECT" });
    expect(parry.intents).toContainEqual({ type: "haptic", pattern: 24 });
    expect(parry.intents).toContainEqual({ type: "profile-max", stat: "topRank", value: 1 });
    const superSlam = addStyle({ kind: "superslam", state: style(), tuning, player: { x: 1, y: 2 }, ghostRecording: true, achievementTracking: false });
    expect(superSlam.intents).toContainEqual({ type: "ghost-capture", kind: "superslam", x: 1, y: 2, importance: 3 });
    expect(superSlam.intents).toContainEqual({ type: "haptic", pattern: [14, 20, 14] });
  });

  it("does not emit farmable achievement work in training modes", () => {
    const result = addStyle({ kind: "parry", state: style(), tuning, player: null, ghostRecording: false, achievementTracking: false });
    expect(intentTypes(result.intents)).toEqual(["tutorial-mark", "rank-up", "music-rank-changed", "haptic"]);
  });

  it("preserves hit loss, timer countdown, drain, zero reset and color thresholds", () => {
    expect(loseStyle(style({ combo: 30 }), tuning)).toMatchObject({ combo: 21, comboTimer: 2, mult: 2, rank: "COOL" });
    expect(updateStyle(style({ combo: 30, comboTimer: 0.1 }), tuning, 0.2)).toMatchObject({ combo: 30, comboTimer: -0.1 });
    expect(updateStyle(style({ combo: 5, comboTimer: 0, lastTrick: "slam" }), tuning, 1)).toMatchObject({ combo: 0, lastTrick: "", mult: 1, rank: "" });
    const colors = { perfect: "p", charger: "c", bomber: "b" };
    expect([1, 2, 3, 4, 5].map((multiplier) => trickColor(multiplier, colors))).toEqual(["#888", "#caa520", "b", "c", "p"]);
  });
});

function run(mode = "classic"): AchievementRunState {
  return { mode, runTime: 100, clearTimer: 0 };
}

describe("achievement runtime", () => {
  it("gates tutorial and playground while enabling every real mode", () => {
    expect([undefined, run("tutorial"), run("playground"), run("classic"), run("campaign")].map(tracksAchievements)).toEqual([false, false, false, true, true]);
  });

  it("resets and marks every stage restriction", () => {
    const state = run();
    resetStageRestrictions(state);
    markStageRestriction(state, "swung"); markStageRestriction(state, "thrown"); markStageRestriction(state, "jumped");
    expect(state.biomeState).toEqual({ swung: true, thrown: true, jumped: true });
  });

  it.each([
    [{ swung: true, thrown: true, jumped: true }, []],
    [{ swung: true, thrown: false, jumped: true }, ["stageNoThrow"]],
    [{ swung: false, thrown: true, jumped: true }, ["stageThrowOnly"]],
    [{ swung: true, thrown: true, jumped: false }, ["stageNoJump"]],
    [{ swung: false, thrown: false, jumped: false }, ["stageNoThrow", "stageThrowOnly", "stageNoJump"]],
  ])("maps restriction state %o to exact authored stats", (biomeState, stats) => {
    const state = { ...run(), biomeState };
    expect(stageDoneIntents(state, { thickskin: 1, warding: 0, sharp: 1 })
      .filter((intent) => intent.type === "profile-max").map((intent) => intent.stat)).toEqual(stats);
    expect(stageDoneIntents(state, { thickskin: 1, warding: 0, sharp: 1 }).at(-1)).toEqual({ type: "achievement-check" });
  });

  it("requires the exact glass-cannon meta loadout", () => {
    const state = { ...run(), biomeState: { swung: true, thrown: true, jumped: true } };
    expect(stageDoneIntents(state, { thickskin: 0, warding: 0, sharp: 1 })).toContainEqual({ type: "profile-max", stat: "stageGlassCannon", value: 1 });
    for (const meta of [{ thickskin: 1, warding: 0, sharp: 1 }, { thickskin: 0, warding: 1, sharp: 1 }, { thickskin: 0, warding: 0, sharp: 0 }]) {
      expect(stageDoneIntents(state, meta).some((intent) => intent.type === "profile-max" && intent.stat === "stageGlassCannon")).toBe(false);
    }
  });

  it("tracks boss damage sources and all four humiliation achievements", () => {
    const state = { ...run(), runTime: 159, _bossFightT: 100 };
    const cases = [
      ["warden", ["deflect"], "deflect", "wardenDeflectOnly"],
      ["colossus", ["throw", "deflect"], "deflect", "colossusThrowOnly"],
      ["echo", ["melee", "deflect"], "deflect", "echoReflectKill"],
      ["source", ["melee"], "melee", "sourceSpeedrun"],
    ] as const;
    for (const [bossId, sources, lastSource, stat] of cases) {
      const boss: AchievementBoss = { isBoss: true, bossId };
      for (const source of sources) recordBossHit(boss, source);
      expect(boss._lastSrc).toBe(lastSource);
      expect(bossKillIntents(state, boss)).toContainEqual({ type: "profile-max", stat, value: 1 });
    }
    expect(bossKillIntents(state, { bossId: "warden", dmgSrc: new Set(["deflect", "melee"]) })).toEqual([]);
    expect(bossKillIntents({ ...state, runTime: 160 }, { bossId: "source" })).toEqual([]);
  });

  it("preserves airborne, transition, parry, projectile, revive and horde state machines", () => {
    const state = { ...run(), clearTimer: 1 };
    expect(killIntents(state, { onGround: false })).toEqual([
      { type: "profile-max", stat: "airComboKills", value: 1 },
      { type: "profile-max", stat: "transitionKills", value: 1 },
    ]);
    expect(parryIntents(state)).toEqual([{ type: "profile-max", stat: "staticParryStreak", value: 1 }]);
    expect(parryIntents(state)).toEqual([{ type: "profile-max", stat: "staticParryStreak", value: 2 }]);
    breakStaticParry(state); expect(state._staticParry).toBe(0);
    const projectile = {};
    expect(dashDodgeIntents(state, projectile)).toEqual([{ type: "profile-max", stat: "projectileDashes", value: 1 }]);
    expect(dashDodgeIntents(state, projectile)).toEqual([]);
    markRevived(state); expect(state._revivedT).toBe(true);
    expect(hordeClearIntents(state, 14.999)).toEqual([{ type: "profile-max", stat: "fastHordeClear", value: 1 }]);
    expect(hordeClearIntents(state, 15)).toEqual([]);
    expect(hordeClearIntents(state, Number.NaN)).toEqual([]);
  });

  it("ticks status combinations, launch, revive and streak resets without touching dead enemies", () => {
    const state = { ...run(), _airKills: 4, _staticParry: 3, _revivedT: true };
    const live = { y: -41, _updraftT: 0.25, bleedStacks: 1, burnT: 1, markT: 1 };
    const dead = { dead: true, y: -100, _updraftT: 5, bleedStacks: 1, burnT: 1, markT: 1 };
    const intents = tickAchievementRuntime({ run: state, player: { onGround: true, dashTimer: 0, hp: 10, maxHp: 10 }, enemies: [live, dead], moving: true, dt: 0.1 });
    expect(state).toMatchObject({ _airKills: 0, _staticParry: 0 });
    expect(live._updraftT).toBeCloseTo(0.15); expect(dead._updraftT).toBe(5);
    expect(intents).toEqual([
      { type: "profile-max", stat: "tripleStatus", value: 1 },
      { type: "profile-max", stat: "launchOffScreen", value: 1 },
      { type: "profile-max", stat: "reviveToFull", value: 1 },
    ]);
  });
});
