import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";

export const FACTORIZED_RETURN_FEATURES = Object.freeze({
  id: "tear-causal-factorized-return.v4", version: 4, hz: 120,
  units: "canonical-fixed1000-to-world", timing: "past-accepted-effect-or-observed-phase-only",
  forbidden: "seed-id-absolute-time-episode-age-future-outcome",
  mask: ["aim", "move", "weapon"], unavailableTimers: true,
});
export const FACTORIZED_RETURN_ADAPTER = Object.freeze({ id: FACTORIZED_RETURN_FEATURES.id,
  adapterHash: stableVerificationHash(FACTORIZED_RETURN_FEATURES) });

export interface FactorizedReturnContext {
  readonly format: "tear-return-causal-context.v4";
  readonly binding: string;
  readonly frontier: string;
  /** Ordering witnesses only; never supplied as a numeric model feature. */
  readonly tick: number;
  readonly phase: string;
  readonly phaseSince: number | null;
  readonly effect: "none" | "throw" | "catch";
  readonly effectAt: number | null;
  readonly throwId: number | null;
  readonly request: "none" | "throw" | "recall" | "secondary";
  readonly requestAt: number | null;
  readonly contextHash: string;
}
export interface FactorizedReturnTransition {
  readonly from: CanonicalGameplayState;
  readonly to: CanonicalGameplayState;
  readonly actions: readonly GameAction[];
  readonly events: readonly TearGameplayEvent[];
}
export interface FactorizedReturnFeatures {
  readonly motor: readonly number[];
  readonly threat: readonly number[];
}
const hashPattern = /^[a-f0-9]{16}$/u;
const keys = ["format", "binding", "frontier", "tick", "phase", "phaseSince", "effect", "effectAt", "throwId", "request", "requestAt", "contextHash"];
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => "value" in d); }
function canonical(state: CanonicalGameplayState): void {
  if (!Number.isSafeInteger(state.tick) || state.tick < 0 || !state.run || !state.player || !state.blade
    || !Number.isSafeInteger(state.run.seed) || !["endless", "campaign", "bossonly", "gauntlet"].includes(state.run.mode)) throw new TypeError("factorized control requires an ordinary committed source state");
}
function binding(state: CanonicalGameplayState): string { canonical(state); return stableVerificationHash({ mode: state.run?.mode, seed: state.run?.seed }); }
function freeze(draft: Omit<FactorizedReturnContext, "contextHash">): FactorizedReturnContext {
  return Object.freeze({ ...draft, contextHash: stableVerificationHash(draft) });
}
export function parseFactorizedReturnContext(value: unknown): FactorizedReturnContext {
  if (!object(value) || Object.keys(value).sort().join() !== [...keys].sort().join()
    || value.format !== "tear-return-causal-context.v4" || !(typeof value.binding === "string" && hashPattern.test(value.binding))
    || !(typeof value.frontier === "string" && hashPattern.test(value.frontier)) || !(typeof value.contextHash === "string" && hashPattern.test(value.contextHash))
    || !Number.isSafeInteger(value.tick) || Number(value.tick) < 0 || typeof value.phase !== "string" || value.phase.length > 32
    || !(typeof value.effect === "string" && ["none", "throw", "catch"].includes(value.effect)) || !(typeof value.request === "string" && ["none", "throw", "recall", "secondary"].includes(value.request))) throw new TypeError("invalid factorized causal context");
  for (const key of ["phaseSince", "effectAt", "requestAt"] as const) if (value[key] !== null
    && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > Number(value.tick))) throw new TypeError("invalid causal context frontier");
  if ((value.effect === "none") !== (value.effectAt === null) || (value.effect === "none") !== (value.throwId === null)
    || value.throwId !== null && (!Number.isSafeInteger(value.throwId) || Number(value.throwId) < 1)
    || (value.request === "none") !== (value.requestAt === null)) throw new TypeError("incoherent causal effect context");
  const { contextHash, ...draft } = value;
  if (stableVerificationHash(draft) !== contextHash) throw new TypeError("causal context integrity mismatch");
  return Object.freeze(structuredClone(value)) as unknown as FactorizedReturnContext;
}
export function requireFactorizedReturnFrontier(context: FactorizedReturnContext, state: CanonicalGameplayState): void {
  const parsed = parseFactorizedReturnContext(context);
  if (parsed.tick !== state.tick || parsed.binding !== binding(state) || parsed.frontier !== stableVerificationHash(state)
    || parsed.phase !== state.blade?.state) throw new TypeError("factorized causal context does not match committed source frontier");
}
/** Tick zero is an actual anchor, not a permission to invent a recovery prefix. */
export function beginFactorizedReturnContext(state: CanonicalGameplayState): FactorizedReturnContext {
  canonical(state);
  if (state.tick !== 0) throw new TypeError("nonzero source requires an authenticated causal prefix or context checkpoint");
  return freeze({ format: "tear-return-causal-context.v4", binding: binding(state), frontier: stableVerificationHash(state),
    tick: state.tick, phase: state.blade?.state ?? "", phaseSince: null, effect: "none", effectAt: null,
    throwId: null, request: "none", requestAt: null });
}
/** One shared updater for governed sequences, online, runtime and checkpoint recovery. */
export function advanceFactorizedReturnContext(previous: FactorizedReturnContext, transition: FactorizedReturnTransition): FactorizedReturnContext {
  requireFactorizedReturnFrontier(previous, transition.from); canonical(transition.to);
  if (binding(transition.to) !== previous.binding || transition.to.tick !== previous.tick + 1) throw new TypeError("causal control requires one ordered committed transition");
  let request = previous.request, requestAt = previous.requestAt;
  for (const action of transition.actions) {
    const parsed = normalizeGameAction(action);
    if (!parsed.ok || stableVerificationHash(parsed.action) !== stableVerificationHash(action)) throw new TypeError("causal history requires literal canonical actions");
    if (action.type === "weapon" && action.phase === "pressed" && action.intent !== "primary") { request = action.intent; requestAt = transition.to.tick; }
  }
  let effect = previous.effect, effectAt = previous.effectAt, throwId = previous.throwId;
  let lastEffectTick = previous.tick;
  for (const event of transition.events) {
    if (!Number.isSafeInteger(event.tick) || event.tick <= previous.tick || event.tick > transition.to.tick || event.tick < lastEffectTick) throw new TypeError("causal effects are not ordered at this committed frontier");
    lastEffectTick = event.tick;
    if (event.kind === "weapon" && ["throw-launch", "catch"].includes(event.event)) {
      if (!Number.isSafeInteger(event.throwId) || event.throwId < 1) throw new TypeError("native transport effect lacks its actual throw identity");
      effect = event.event === "throw-launch" ? "throw" : "catch"; effectAt = event.tick; throwId = event.throwId;
    }
  }
  const phase = transition.to.blade?.state ?? "";
  return freeze({ format: previous.format, binding: previous.binding, frontier: stableVerificationHash(transition.to), tick: transition.to.tick,
    phase, phaseSince: phase !== previous.phase ? transition.to.tick : previous.phaseSince, effect, effectAt, throwId, request, requestAt });
}
/** The caller supplies the accepted prefix digest from its governed receipt/checkpoint authority. */
export function restoreFactorizedReturnPrefix(anchor: CanonicalGameplayState, transitions: readonly FactorizedReturnTransition[],
  expectedPrefixHash: string): FactorizedReturnContext {
  if (!hashPattern.test(expectedPrefixHash) || stableVerificationHash({ anchor, transitions }) !== expectedPrefixHash) throw new TypeError("causal prefix authority mismatch");
  if (transitions.length > 20_000) throw new RangeError("causal prefix exceeds the declared bound");
  return transitions.reduce(advanceFactorizedReturnContext, beginFactorizedReturnContext(anchor));
}
const phases = ["held", "flying", "returning", "embedded", "hooked", "captured", "slinging"];
function oneHot(value: string, choices: readonly string[]): number[] { return [...choices.map(choice => Number(value === choice)), Number(!choices.includes(value))]; }
function finite(value: number): number { if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new TypeError("nonfinite or unbounded causal source feature"); return value; }
/** No seed, tick, runTime, IDs, future effects or initial held-age enters these vectors. */
export function projectFactorizedReturnFeatures(state: CanonicalGameplayState, context: FactorizedReturnContext): FactorizedReturnFeatures {
  requireFactorizedReturnFrontier(context, state);
  const { player, blade, input } = state;
  if (player === null || blade === null) throw new TypeError("missing canonical control bodies");
  const age = (at: number | null): readonly number[] => at === null ? [0, 0] : [1, (state.tick - at) / 120];
  const motor = [...oneHot(blade.state, phases), (blade.x - player.x) / 1000, (blade.y - player.y) / 1000,
    blade.vx / 1000, blade.vy / 1000, player.vx / 1000, player.vy / 1000, player.hp / 1000,
    input.moveX, input.moveY, Math.sin(input.aimTurn * 2 * Math.PI / 1_000_000), Math.cos(input.aimTurn * 2 * Math.PI / 1_000_000),
    (input.aimMagnitude ?? 1000) / 1000, Number(input.primaryHeld),
    ...oneHot(context.effect, ["none", "throw", "catch"]), ...age(context.effectAt),
    ...oneHot(context.request, ["none", "throw", "recall", "secondary"]), ...age(context.requestAt), ...age(context.phaseSince)];
  const threatVector = (enemy?: CanonicalGameplayState["enemies"][number]): number[] => {
    const kind = enemy?.bossId ? "boss" : enemy?.kind ?? "none";
    return [Number(enemy !== undefined), ...oneHot(kind, ["none", "charger", "armored", "ranged", "flyer", "support", "boss"]),
      enemy ? (enemy.x - player.x) / 1000 : 0, enemy ? (enemy.y - player.y) / 1000 : 0,
      (enemy?.vx ?? 0) / 1000, (enemy?.vy ?? 0) / 1000, (enemy?.hp ?? 0) / 1000,
      Number(enemy?.rimehound !== undefined || enemy?.whiteHart !== undefined),
      ...oneHot(enemy?.rimehound?.atk ?? enemy?.whiteHart?.atk ?? "unknown", ["unknown", "idle", "windup", "commit", "recover"])];
  };
  const threats = state.enemies.filter(enemy => !enemy.dead && enemy.hp > 0).map(enemy => ({
    distance: (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2, vector: threatVector(enemy) }));
  // Complete emitted semantics break equal-distance ties; roster order/actor IDs never do.
  threats.sort((a, b) => a.distance - b.distance || JSON.stringify(a.vector).localeCompare(JSON.stringify(b.vector)));
  const threat = threats[0]?.vector ?? threatVector();
  return Object.freeze({ motor: Object.freeze(motor.map(finite)), threat: Object.freeze(threat.map(finite)) });
}
