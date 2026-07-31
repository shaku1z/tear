import { describe, expect, it } from "vitest";
import {
  liveRewardChoiceIds,
  routeLiveTearBenchAction,
  type TearBenchActionRouting,
} from "../../src/tearbench/live-runtime-action-routing";

function routingFixture(initialScreen = "draft") {
  let screen = initialScreen;
  let mode = "endless";
  let focus = -1;
  const calls: string[] = [];
  const controls = [
    { label: "Disabled", enabled: false, action: () => calls.push("disabled") },
    { label: "Resume", action: () => calls.push("resume") },
    { label: "Main menu", action: () => calls.push("menu") },
  ];
  const routing: TearBenchActionRouting = {
    screen: () => screen,
    setScreen: (next) => { screen = next; calls.push(`screen:${next}`); },
    runMode: () => mode,
    reward: () => ({ choices: [{ id: "draft-a" }, { id: "draft-b" }], reserveChoices: [{ id: "reserve-a" }] }),
    chooseUpgrade: (index) => calls.push(`draft:${String(index)}`),
    chooseReserve: (index) => calls.push(`reserve:${String(index)}`),
    chooseTier: (index) => calls.push(`tier:${String(index)}`),
    dispatchPlayground: (id) => calls.push(`ability:${id}`),
    renderControls: () => calls.push("render"),
    controls: () => controls,
    focus: () => focus,
  };
  return {
    routing,
    calls,
    setScreen: (next: string) => { screen = next; },
    setMode: (next: string) => { mode = next; },
    setFocus: (next: number) => { focus = next; },
  };
}

describe("live runtime action routing", () => {
  it("exposes only choices valid for the active reward screen", () => {
    const fixture = routingFixture("draft");
    expect(liveRewardChoiceIds(fixture.routing)).toEqual(["draft-a", "draft-b"]);
    fixture.setScreen("reserve");
    expect(liveRewardChoiceIds(fixture.routing)).toEqual(["reserve-a"]);
    fixture.setScreen("playing");
    expect(liveRewardChoiceIds(fixture.routing)).toEqual([]);
  });

  it("routes semantic reward choices only to their matching live state", () => {
    const fixture = routingFixture("draft");
    expect(routeLiveTearBenchAction(fixture.routing, { type: "draft-choice", choiceId: "draft-b" })).toBe(true);
    fixture.setScreen("reserve");
    expect(routeLiveTearBenchAction(fixture.routing, { type: "reserve-choice", choiceId: "reserve-a" })).toBe(true);
    fixture.setScreen("tierup");
    expect(routeLiveTearBenchAction(fixture.routing, { type: "tier-up-choice", choiceId: "draft-a" })).toBe(true);
    fixture.setScreen("playing");
    expect(routeLiveTearBenchAction(fixture.routing, { type: "draft-choice", choiceId: "draft-a" })).toBe(false);
    expect(fixture.calls).toEqual(["draft:1", "reserve:0", "tier:0"]);
  });

  it("keeps pause, playground, and control routing semantic and deterministic", () => {
    const fixture = routingFixture("playing");
    expect(routeLiveTearBenchAction(fixture.routing, { type: "pause" })).toBe(true);
    expect(routeLiveTearBenchAction(fixture.routing, { type: "pause" })).toBe(true);
    expect(routeLiveTearBenchAction(fixture.routing, { type: "ability", abilityId: "pulse", phase: "pressed" })).toBe(false);
    fixture.setMode("playground");
    expect(routeLiveTearBenchAction(fixture.routing, { type: "ability", abilityId: "pulse", phase: "released" })).toBe(true);
    expect(routeLiveTearBenchAction(fixture.routing, { type: "ability", abilityId: "pulse", phase: "pressed" })).toBe(true);
    fixture.setFocus(-1);
    expect(routeLiveTearBenchAction(fixture.routing, { type: "confirm" })).toBe(true);
    expect(routeLiveTearBenchAction(fixture.routing, { type: "cancel" })).toBe(true);
    expect(fixture.calls).toEqual([
      "screen:paused", "screen:playing", "ability:pulse", "render", "resume", "render", "resume",
    ]);
  });
});
