import type { GameAction } from "../input/game-action";
import type { TearSimulationEnemyView } from "../simulation/runtime-world-port";
import { ENTITY_KIND_REGISTRY, STAGE_IDS, type TearEntityKindId, type TearStageId } from "./registries";

/** One source-owned stage identity shared by live and detached observations. */
export function canonicalObservationStage(index: number): TearStageId {
  const stage = Number.isSafeInteger(index) ? STAGE_IDS[index] : undefined;
  if (stage === undefined) throw new RangeError(`unregistered production stage index: ${String(index)}`);
  return stage;
}

/** Resolves authored support subtypes, void wisps, and bosses identically in both backends. */
export function canonicalObservationEnemyKind(
  enemy: Pick<TearSimulationEnemyView, "kind"> & Partial<Pick<TearSimulationEnemyView,
    "bossId" | "supportType" | "isVoidWisp">>,
): TearEntityKindId {
  let raw = enemy.kind;
  if (typeof enemy.bossId === "string" && enemy.bossId.length > 0) raw = enemy.bossId;
  else if (enemy.kind === "support" && typeof enemy.supportType === "string") raw = enemy.supportType;
  else if (enemy.kind === "wisp" && enemy.isVoidWisp === true) raw = "void-wisp";
  return ENTITY_KIND_REGISTRY.assert(raw.toLowerCase());
}

/** Advertises only semantic actions actually available to the selected runtime surface. */
export function canonicalObservationActions(
  screen: string,
  runMode: string,
  supportsPause: boolean,
): readonly GameAction["type"][] {
  if (screen === "playing") return Object.freeze([
    "move", "aim", "weapon", "jump", "dash", ...(runMode === "playground" ? ["ability" as const] : []),
    ...(supportsPause ? ["pause" as const] : []),
  ]);
  if (screen === "draft") return Object.freeze(["draft-choice"]);
  if (screen === "reserve") return Object.freeze(["reserve-choice", "cancel"]);
  if (screen === "tierup") return Object.freeze(["tier-up-choice"]);
  if (screen === "paused") return Object.freeze(["confirm", "cancel", "pause"]);
  return Object.freeze(["interact", "confirm", "cancel"]);
}
