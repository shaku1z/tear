/**
 * Input generators shared by Tear's property tests (see `property-harness.ts`).
 * Value ranges come from the game's own constants, so a changed range changes
 * what is generated.
 */
import { AIM_MAGNITUDE_SCALE, AIM_TURN_SCALE, INPUT_AXIS_SCALE } from "../../src/domain/input-scales";
import type { GameAction } from "../../src/input/game-action";
import { fc } from "./property-harness";

/** Any JSON value, with strings over every code point (lone surrogates included). */
export const anyJson = fc.jsonValue({ stringUnit: "binary", maxDepth: 4 });

/** Any value a JavaScript caller could pass, JSON or not (undefined, NaN, Map, typed arrays, ...). */
export const anyValue = fc.anything({
  maxDepth: 3,
  withBoxedValues: true,
  withMap: true,
  withSet: true,
  withNullPrototype: true,
  withSparseArray: true,
  withTypedArray: true,
  withDate: true,
  withBigInt: true,
});

/** Text a storage slot could hold: JSON of any value, a damaged copy of it, or any string. */
export const anyStoredText = fc.oneof(
  anyJson.map((value) => JSON.stringify(value)),
  fc.tuple(anyJson, fc.nat()).map(([value, cut]) => {
    const text = JSON.stringify(value);
    return text.slice(0, cut % (text.length + 1));
  }),
  fc.string({ unit: "binary" }),
);

/**
 * An object shaped like a stored record: some of `fields` (each with a value of
 * any JSON type, a small whole number or an object), plus unknown fields.
 */
export function recordLike(fields: readonly string[]): fc.Arbitrary<Record<string, unknown>> {
  const fieldValue = fc.oneof(anyJson, fc.integer({ min: -1, max: 8 }), fc.dictionary(fc.string(), anyJson));
  return fc
    .tuple(
      fc.dictionary(fc.constantFrom(...fields), fieldValue, { maxKeys: fields.length }),
      fc.dictionary(fc.string(), anyJson, { maxKeys: 3 }),
    )
    .map(([known, unknown]) => ({ ...unknown, ...known }));
}

const axis = fc.integer({ min: -INPUT_AXIS_SCALE, max: INPUT_AXIS_SCALE });
const phase = fc.constantFrom("pressed" as const, "released" as const);

/** Actions a player sends during a fight; menu and reward choices are left out. */
export const playAction: fc.Arbitrary<GameAction> = fc.oneof(
  fc.record({ type: fc.constant("move" as const), x: axis, y: axis }),
  fc.record({
    type: fc.constant("aim" as const),
    turn: fc.integer({ min: 0, max: AIM_TURN_SCALE - 1 }),
    magnitude: fc.integer({ min: 0, max: AIM_MAGNITUDE_SCALE }),
  }),
  fc.record({
    type: fc.constant("weapon" as const),
    intent: fc.constantFrom("primary" as const, "secondary" as const, "throw" as const, "recall" as const),
    phase,
  }),
  fc.record({ type: fc.constant("jump" as const), phase }),
  fc.record({ type: fc.constant("dash" as const), x: axis, y: axis }),
);

/** Any action, menu and reward choices included. Identifiers carry spaces the action normalizer trims. */
export const anyAction: fc.Arbitrary<GameAction> = fc.oneof(
  playAction,
  fc.record({ type: fc.constant("ability" as const), abilityId: fc.string({ minLength: 1, maxLength: 130 }), phase }),
  fc.constantFrom(...(["interact", "pause", "confirm", "cancel"] as const)).map((type) => ({ type })),
  fc.record({
    type: fc.constantFrom("draft-choice" as const, "reserve-choice" as const, "tier-up-choice" as const),
    choiceId: fc.string({ minLength: 1, maxLength: 130 }),
  }),
);

/** Ticks of play: each tick holds up to three actions. */
export function playTicks(minimum: number, maximum: number): fc.Arbitrary<readonly (readonly GameAction[])[]> {
  return fc.array(fc.array(playAction, { maxLength: 3 }), { minLength: minimum, maxLength: maximum });
}
