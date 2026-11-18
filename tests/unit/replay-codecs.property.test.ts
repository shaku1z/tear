/**
 * Replay data and its codecs:
 * - an action normalized once is unchanged by normalizing it again;
 * - a valid replay envelope is its own canonical form, also through storage text,
 *   and parsing never throws, whatever it is given;
 * - a Ghost chunk decodes to the payload it encoded, with and without compression.
 */
import { describe, expect, it } from "vitest";

import {
  decodeGhostChunkPayload,
  encodeGhostChunkPayload,
  encodeGhostChunkPayloadCompressed,
} from "../../src/ghost/capsule-codec";
import { FINAL_FIVE_WEAPON_SCHEMA_VERSION, WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { normalizeGameAction } from "../../src/input/game-action";
import {
  CURRENT_REPLAY_SCHEMA_VERSION,
  REPLAY_FORMAT,
  parseReplayEnvelope,
  validateReplayEnvelope,
} from "../../src/replay/envelope";
import { anyAction, anyJson, anyStoredText, anyValue } from "./property-arbitraries";
import { checkAsyncProperty, checkProperty, fc } from "./property-harness";

const text = (maxLength: number) =>
  fc.string({ unit: "binary", minLength: 1, maxLength }).filter((value) => value.trim() !== "");

const tearScore = fc.oneof(
  fc.record({
    enabled: fc.constant(false),
    reason: fc.constantFrom("disabled" as const, "fallback" as const, "not-recorded" as const),
  }),
  fc.record({
    enabled: fc.constant(true),
    engineVersion: text(32),
    scoreVersion: text(32),
    seed: text(32),
    eventJournalHash: text(32),
  }),
);

/** A replay the game would accept: ids rise, ticks never fall, the final tick is last. */
const validReplay = fc
  .record({
    rulesetVersion: text(32),
    build: fc.record({ version: text(16), revision: text(16), target: text(16) }),
    run: fc.record({
      runId: text(32),
      seed: text(32),
      ticksPerSecond: fc.integer({ min: 1, max: 1_000 }),
      weaponId: fc.constantFrom(...WEAPON_IDS),
      weaponSchemaVersion: fc.constant(FINAL_FIVE_WEAPON_SCHEMA_VERSION),
    }),
    steps: fc.array(fc.record({ idGap: fc.integer({ min: 1, max: 3 }), tickGap: fc.nat(40), command: anyAction }), {
      maxLength: 40,
    }),
    finalGap: fc.nat(100),
    tearScore,
  })
  .map(({ steps, finalGap, ...rest }) => {
    let id = 0,
      tick = 0;
    const actions = steps.map((step) => {
      id += step.idGap;
      tick += step.tickGap;
      return { kind: "command", id, tick, command: step.command };
    });
    return {
      format: REPLAY_FORMAT,
      schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
      ...rest,
      actions,
      final: { tick: tick + finalGap, stateHash: "a1b2c3d4" },
    };
  });

describe("game actions", () => {
  it("normalizing twice gives the first result", () => {
    checkProperty(
      fc.property(fc.oneof(anyAction, anyValue), (candidate) => {
        const first = normalizeGameAction(candidate);
        if (first.ok) expect(normalizeGameAction(first.action)).toEqual(first);
      }),
    );
  });
});

describe("replay envelope", () => {
  it("parsing never throws, whatever it is given", () => {
    checkProperty(
      fc.property(fc.oneof(anyValue, anyJson, anyStoredText, validReplay), (input) => {
        expect(typeof parseReplayEnvelope(input).ok).toBe("boolean");
      }),
    );
  });

  it("a valid replay is its own canonical form, also through storage text", () => {
    checkProperty(
      fc.property(validReplay, (replay) => {
        const first = validateReplayEnvelope(replay);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        expect(validateReplayEnvelope(first.replay)).toEqual(first);
        expect(parseReplayEnvelope(JSON.stringify(first.replay), first.replay.rulesetVersion)).toEqual(first);
      }),
    );
  });
});

describe("Ghost chunk codec", () => {
  it("decodes to the payload it encoded, with and without compression", async () => {
    await checkAsyncProperty(
      fc.asyncProperty(anyJson, fc.boolean(), async (payload, compressed) => {
        const encoded = compressed
          ? await encodeGhostChunkPayloadCompressed(payload)
          : encodeGhostChunkPayload(payload);
        const decoded = await decodeGhostChunkPayload(encoded.encoding, encoded.encoded);
        // Compared as text: the payload travels as JSON, which writes -0 as 0.
        expect(JSON.stringify(decoded)).toBe(JSON.stringify(payload));
      }),
    );
  });
});
