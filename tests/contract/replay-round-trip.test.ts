import { describe, expect, it } from "vitest";
import { EnvelopeSequencer } from "../../src/app/messages";
import type { GameAction } from "../../src/input/game-action";
import { parseReplayEnvelope, type ReplayActionEnvelope, type ReplayEnvelopeV2 } from "../../src/replay/envelope";
import { stableVerificationHash } from "../../src/replay/hash";
import { FixedStepScheduler } from "../../src/simulation/fixed-step";

function recordAtRenderRate(renderRate: number): ReplayEnvelopeV2 {
  const scheduler = new FixedStepScheduler({ ticksPerSecond: 60 });
  const sequencer = new EnvelopeSequencer();
  const actions: ReplayActionEnvelope[] = [];
  const frames = renderRate * 2;
  for (let frame = 0; frame < frames; frame += 1) {
    scheduler.advance(1_000 / renderRate, (_seconds, tick) => {
      let action: GameAction | undefined;
      if (tick === 15) action = { type: "move", x: 1_000, y: 0 };
      if (tick === 45) action = { type: "weapon", intent: "primary", phase: "pressed" };
      if (tick === 46) action = { type: "weapon", intent: "primary", phase: "released" };
      if (action !== undefined) actions.push(sequencer.command(tick, action));
    });
  }
  const finalState = { tick: scheduler.tick, acceptedActionIds: actions.map((entry) => entry.id) };
  return {
    format: "tear-replay",
    schemaVersion: 2,
    rulesetVersion: "contract-rules",
    build: { version: "contract", revision: "contract", target: "test" },
    run: { runId: "contract-run", seed: "contract-seed", ticksPerSecond: 60 },
    actions,
    final: { tick: scheduler.tick, stateHash: stableVerificationHash(finalState) },
    tearScore: { enabled: false, reason: "disabled" },
  };
}

describe("replay serialization contract", () => {
  it("round-trips through JSON without losing typed action or provenance data", () => {
    const replay = recordAtRenderRate(60);
    const parsed = parseReplayEnvelope(JSON.stringify(replay));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.replay).toEqual(replay);
  });

  it("records identical tick data independently of render rate", () => {
    expect(recordAtRenderRate(30)).toEqual(recordAtRenderRate(60));
    expect(recordAtRenderRate(144)).toEqual(recordAtRenderRate(60));
  });
});
