import { describe, expect, it } from "vitest";
import {
  C24LongitudinalJourneyDirector,
  freezeC24CombatLevels,
  planLongitudinalPurchase,
  type LongitudinalPolicy,
  type LongitudinalProgressionObservation,
} from "../../src/agents/longitudinal-progression";
import type { RunResultInfo } from "../../src/gameplay/run/outcome-planner";

const policy: LongitudinalPolicy = Object.freeze({
  id: "unit-cheap",
  maxEpisodes: 2,
  maxSpend: 400,
  targets: Object.freeze([{ id: "tough", level: 1 }]),
});

function progression(
  wallet: number,
  level = 0,
  enabled = wallet >= 325 && level < 1,
): LongitudinalProgressionObservation {
  return Object.freeze({
    wallet,
    lifetimeEarned: wallet,
    levels: Object.freeze({ tough: level }),
    shop: Object.freeze([Object.freeze({
      id: "tough", level, maxLevel: 8, cost: level === 0 ? 325 : 450, enabled,
    })]),
  });
}

function outcome(win = false): RunResultInfo {
  return Object.freeze({
    wave: 5,
    score: 1_200,
    time: 90,
    log: Object.freeze([]),
    best: Object.freeze({ wave: 5, score: 1_200, time: 90 }),
    isNew: true,
    earned: 69,
    coins: 400,
    ...(win ? { win: true as const, campaign: true, diff: "easy" as const } : {}),
  });
}

describe("C24 longitudinal earned-profile policy", () => {
  it("buys only an enabled affordable target within the spend ceiling", () => {
    expect(planLongitudinalPurchase(progression(400), 0, policy)).toEqual({
      id: "tough", levelBefore: 0, levelAfter: 1, cost: 325,
    });
    expect(planLongitudinalPurchase(progression(324), 0, policy)).toBeNull();
    expect(planLongitudinalPurchase(progression(400), 100, policy)).toBeNull();
    expect(planLongitudinalPurchase(progression(400, 1, false), 0, policy)).toBeNull();
  });

  it("records defeat, purchases through typed actions, and begins the next deterministic episode", () => {
    const director = new C24LongitudinalJourneyDirector(62, progression(0), policy);
    expect(director.step("gameover", outcome(), progression(400))).toEqual({
      type: "activate", action: { type: "navigate", to: "menu" },
    });
    expect(director.step("menu", outcome(), progression(400))).toEqual({
      type: "activate", action: { type: "navigate", to: "shop", resetScroll: true },
    });
    expect(director.step("shop", outcome(), progression(400))).toEqual({
      type: "activate", action: { type: "shop.buy", id: "tough" },
    });
    expect(director.step("shop", outcome(), progression(75, 1, false))).toEqual({
      type: "activate", action: { type: "navigate", to: "menu" },
    });
    expect(director.step("menu", outcome(), progression(75, 1, false))).toEqual({
      type: "begin-episode", seed: 63,
    });
    expect(director.snapshot()).toMatchObject({
      label: "longitudinal-earned-profile",
      policyId: "unit-cheap",
      spent: 325,
      currentEpisode: 2,
      currentSeed: 63,
      episodes: [{
        episode: 1, seed: 62, outcome: "defeat", wave: 5, score: 1_200,
        coinsEarned: 69, walletBefore: 0, walletAfter: 400,
      }],
      purchases: [{
        episode: 1, id: "tough", levelBefore: 0, levelAfter: 1,
        cost: 325, walletBefore: 400, walletAfter: 75,
      }],
    });
  });

  it("fails closed when a typed purchase does not change the observed level", () => {
    const director = new C24LongitudinalJourneyDirector(62, progression(0), policy);
    director.step("gameover", outcome(), progression(400));
    director.step("menu", outcome(), progression(400));
    director.step("shop", outcome(), progression(400));
    expect(director.step("shop", outcome(), progression(400))).toEqual({
      type: "fail", reason: "longitudinal-purchase-not-applied:tough",
    });
  });

  it("freezes only the declared combat-affecting level vector on victory", () => {
    const director = new C24LongitudinalJourneyDirector(62, progression(0), policy);
    const won = { ...progression(2_000, 1, false), levels: {
      tough: 1, sharp: 2, thickskin: 2, lifeline: 1, warding: 2, phoenix: 1,
      aircharge: 1, greed: 5,
    } };
    expect(director.step("win", outcome(true), won)).toEqual({
      type: "activate", action: { type: "navigate", to: "menu" },
    });
    expect(director.step("menu", outcome(true), won)).toEqual({ type: "complete" });
    expect(director.snapshot().frozenCombatLevels).toEqual(freezeC24CombatLevels(won.levels));
    expect(director.snapshot().frozenCombatLevels).not.toHaveProperty("greed");
  });

  it("enforces an explicit episode ceiling instead of grinding indefinitely", () => {
    const oneEpisode = { ...policy, maxEpisodes: 1 };
    const director = new C24LongitudinalJourneyDirector(62, progression(0), oneEpisode);
    expect(director.step("gameover", outcome(), progression(100))).toEqual({
      type: "fail", reason: "longitudinal-episode-ceiling",
    });
    expect(director.snapshot().terminalReason).toBe("longitudinal-episode-ceiling");
    expect(director.snapshot().frozenCombatLevels).toEqual(freezeC24CombatLevels({ tough: 0 }));
  });
});
