import { describe, expect, it } from "vitest";

import type { GameAction } from "../../src/input/game-action";
import {
  CANONICAL_ENGINEERING_SCENARIOS,
  createProductionHeadlessEnvironment,
  type TearCausalEventV1,
  type TearObservationV1,
} from "../../src/tearbench";

const scenarios = CANONICAL_ENGINEERING_SCENARIOS.filter((scenario) =>
  scenario.subject.kind === "gameplay" && scenario.backends.includes("headless"));

function assertSubjectTransition(subject: string, initial: TearObservationV1,
  observations: readonly TearObservationV1[], events: readonly TearCausalEventV1[],
  actions: readonly GameAction[]): void {
  const last = observations.at(-1);
  if (last === undefined) throw new Error(`canonical ${subject} subject never advanced its production backend`);
  const proved = subject === "boot"
    ? events.some((event) => event.type === "run.started" && event.source === "engine")
    : subject === "movement"
      ? actions.some((action) => action.type === "jump") && last.player.y < initial.player.y
      : subject === "dash"
        ? actions.some((action) => action.type === "dash") && (last.player.dashTimer ?? 0) > 0
          && last.player.x !== initial.player.x
        : false;
  if (!proved) throw new Error(`canonical ${subject} scenario did not exercise its declared source-owned subject`);
}

describe("source-owned current headless gameplay scenario subjects", () => {
  it("fails first when generic headless reset/move/tick is asked to stand in for Bloom Well", () => {
    const bloom = CANONICAL_ENGINEERING_SCENARIOS.find((entry) => entry.id === "verdant-bloom-well-cycle");
    if (bloom === undefined) throw new Error("the canonical Bloom Well scenario is missing");
    const environment = createProductionHeadlessEnvironment();
    try {
      const falselyDeclared = { ...bloom, backends: ["live", "headless"] as const };
      const opening = environment.reset(falselyDeclared);
      const transition = environment.step([{ type: "move", x: 1_000, y: 0 }]);
      expect(opening.environment?.fields).toEqual([]);
      expect(opening.environment?.routes).toEqual([]);
      expect(transition.events?.some((event) => event.type.startsWith("world.environment-"))).toBe(false);
      expect(() => environment.reset(bloom)).toThrow(/does not support headless/u);
    } finally {
      environment.dispose();
    }
  });

  it("narrows unsupported natural-headless progression and projectile injection to the live backend", () => {
    for (const subject of ["blade", "parry", "wave", "draft"]) {
      const scenario = CANONICAL_ENGINEERING_SCENARIOS.find((entry) => entry.subject.kind === "gameplay"
        && entry.subject.id === subject);
      expect(scenario?.backends, subject).toEqual(["live"]);
    }
  });

  it.each(scenarios)("exercises the actual $id subject through its declared ordinary-headless backend", (scenario) => {
    const environment = createProductionHeadlessEnvironment();
    const events: TearCausalEventV1[] = [];
    const observations: TearObservationV1[] = [];
    const actions: GameAction[] = [];
    try {
      environment.reset(scenario);
      let opening = environment.policyObservation();
      if (scenario.subject.id === "movement") {
        for (let tick = 0; tick < 30 && !opening.player.grounded; tick += 1) {
          events.push(...environment.step([]).events ?? []);
          opening = environment.policyObservation();
        }
      }
      const commanded: GameAction[] = scenario.subject.id === "movement"
        ? [{ type: "move", x: 1_000, y: 0 }, { type: "jump", phase: "pressed" }]
        : scenario.subject.id === "dash"
          ? [{ type: "dash", x: 1_000, y: 0 }]
          : [];
      actions.push(...commanded);
      const transition = environment.step(commanded);
      events.push(...transition.events ?? []);
      observations.push(environment.policyObservation());
      assertSubjectTransition(scenario.subject.id, opening, observations, events, actions);
    } finally {
      environment.dispose();
    }
  });

  it("rejects a reset-only or movement-only receipt as proof of the declared dash subject", () => {
    const scenario = scenarios.find((entry) => entry.subject.id === "dash");
    if (scenario === undefined) throw new Error("the current headless dash scenario is missing");
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(scenario);
      const opening = environment.policyObservation();
      expect(() => { assertSubjectTransition("dash", opening, [], [], []); })
        .toThrow(/never advanced its production backend/u);
      const action: GameAction = { type: "move", x: 1_000, y: 0 };
      const transition = environment.step([action]);
      expect(() => {
        assertSubjectTransition("dash", opening, [environment.policyObservation()], transition.events ?? [], [action]);
      }).toThrow(/did not exercise its declared source-owned subject/u);
    } finally {
      environment.dispose();
    }
  });
});
