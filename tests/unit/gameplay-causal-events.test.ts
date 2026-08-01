import { describe, expect, it } from "vitest";

import type { TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { createGameplayCausalEvent } from "../../src/tearbench/gameplay-causal-events";
import { validateTearContract } from "../../src/tearbench/validation";

const run = {
  kind: "run", tick: 7, transition: "completed", runId: "run-a", mode: "campaign", difficulty: "hard",
  weaponId: "hammer", wave: 4, score: 900, runTimeSeconds: 12.5, reason: "victory",
} as const;

describe("native gameplay causal-event adapter", () => {
  it("maps every native gameplay fact through one valid versioned ontology", () => {
    const facts: readonly TearGameplayEvent[] = [
      run,
      { kind: "stage", tick: 7, stage: 3 },
      { kind: "wave", tick: 7, wave: 4, event: "start" },
      { kind: "wave", tick: 7, wave: 4, event: "clear" },
      { kind: "wave", tick: 7, wave: 4, event: "spawn-completed" },
      { kind: "wave", tick: 7, wave: 4, event: "boss" },
      { kind: "spawn", tick: 7, actorId: "enemy:4", actorKind: "warden", x: 11.25, y: 22.5,
        variantName: "frenzied", bossId: "warden" },
      { kind: "death", tick: 7, actorId: "enemy:4", cause: "blade" },
      { kind: "loadout", tick: 7, choiceId: "dash", tier: 1, wave: 4 },
      { kind: "loadout", tick: 7, choiceId: "dash-plus", tier: 2, wave: 4 },
      { kind: "effect", tick: 7, effect: "perfect-parry", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "blade-throw", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "blade-recall", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "dash-start", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "stolenBlade", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "revive", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "bossKill", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "unclassified", x: 1, y: 2 },
    ];
    const expected = [
      "run.completed", "stage.entered", "wave.started", "wave.cleared", "wave.spawn-completed", "wave.spawn-completed",
      "enemy.spawned", "enemy.defeated", "draft.selected", "tier.selected", "combat.perfect-parry",
      "blade.thrown", "blade.recalled", "player.dash-started", "blade.stolen", "player.revived",
      "boss.defeated", "system.checkpoint",
    ];

    const events = facts.map((fact, index) => createGameplayCausalEvent(fact, index, `test:${String(index)}`));
    expect(events.map((event) => event.type)).toEqual(expected);
    expect(events.every((event) => validateTearContract(event).ok)).toBe(true);
    expect(events[6]).toMatchObject({ actorId: "enemy:4", payload: {
      actorKind: "warden", x: 11.25, y: 22.5, variantName: "frenzied", bossId: "warden",
    } });
    expect(events[0]).toMatchObject({ phase: "post-simulation-commit", payload: {
      runId: "run-a", mode: "campaign", difficulty: "hard", weapon: "hammer", reason: "victory",
    } });
  });

  it("maps every run transition and assigns its semantic phase", () => {
    const transitions = [
      ["started", "run.started", "pre-simulation"],
      ["paused", "run.paused", "post-simulation-commit"],
      ["resumed", "run.resumed", "pre-simulation"],
      ["completed", "run.completed", "post-simulation-commit"],
      ["defeated", "run.defeated", "post-simulation-commit"],
      ["abandoned", "run.abandoned", "post-simulation-commit"],
    ] as const;
    expect(transitions.map(([transition], index) => {
      const event = createGameplayCausalEvent({ ...run, transition }, index, `run:${String(index)}`);
      return [event.type, event.phase];
    })).toEqual(transitions.map(([, type, phase]) => [type, phase]));
  });

  it("omits absent optional fields and freezes both event and payload", () => {
    const event = createGameplayCausalEvent({
      kind: "spawn", tick: 1, actorId: "enemy:1", actorKind: "charger", x: 1, y: 2,
    }, 0, "spawn:0");
    expect(event.payload).toEqual({ actorKind: "charger", x: 1, y: 2 });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
  });

  it("preserves exact payload values and ordering fields", () => {
    const event = createGameplayCausalEvent(run, 41, "parity:41");
    expect(event).toEqual({
      format: "tear-contract", kind: "event", schemaVersion: 1, id: "parity:41", type: "run.completed",
      tick: 7, phase: "post-simulation-commit", sequence: 41, source: "engine",
      payload: { runId: "run-a", mode: "campaign", difficulty: "hard", weapon: "hammer",
        wave: 4, score: 900, runTimeSeconds: 12.5, reason: "victory" },
    });
  });

  it("rejects invalid ordering and identity instead of silently normalizing them", () => {
    expect(() => createGameplayCausalEvent(run, -1, "bad")).toThrow(/sequence/u);
    expect(() => createGameplayCausalEvent(run, 0, "")).toThrow(/ID/u);
    expect(() => createGameplayCausalEvent(run, 0, " ")).toThrow(/ID/u);
    expect(() => createGameplayCausalEvent(run, 0, "x".repeat(257))).toThrow(/ID/u);
    expect(() => createGameplayCausalEvent({ ...run, tick: -1 }, 0, "bad-tick")).toThrow(/tick/u);
  });
});
