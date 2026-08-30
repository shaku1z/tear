import type { GameAction } from "../input/game-action";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { TearSimulationEnemyView } from "../simulation/runtime-world-port";
import { stageIdAtRuntimeIndex } from "../gameplay/stages";
import { ENTITY_KIND_REGISTRY, type TearEntityKindId, type TearStageId } from "./registries";

/** Associates actors with the current production wave using actual native lifecycle facts. */
export function createSourceWaveOwnershipTracker() {
  let activeWave: number | undefined;
  const actorIds = new Set<string>();
  return Object.freeze({
    consume(event: TearGameplayEvent): void {
      if (event.kind === "run" && event.transition === "started") {
        // Live opening content publishes its wave fact before the run-start
        // fact so recording can begin after synchronous chapter setup. The
        // owner must not regress from that newer wave back to the session's
        // pre-opening wave. Callers invalidate explicitly between runs.
        if (activeWave === undefined || event.wave > activeWave) {
          activeWave = event.wave;
          actorIds.clear();
        }
      } else if (event.kind === "wave" && (event.event === "start" || event.event === "boss")) {
        if (activeWave !== event.wave) actorIds.clear();
        activeWave = event.wave;
      } else if (event.kind === "spawn" && activeWave !== undefined) {
        actorIds.add(event.actorId);
      } else if (event.kind === "death") {
        actorIds.delete(event.actorId);
      }
    },
    actors(wave: number): ReadonlySet<string> | undefined {
      return activeWave === wave ? actorIds : undefined;
    },
    /**
     * Re-establishes an empty current wave after a validated State Forge
     * restore. Callers must prove that the restored world has no living
     * enemies; non-empty snapshots cannot reconstruct wave ownership from
     * entity presence alone.
     */
    restoreEmptyWave(wave: number): void {
      if (!Number.isSafeInteger(wave) || wave < 0) throw new RangeError("restored wave must be a non-negative safe integer");
      activeWave = wave;
      actorIds.clear();
    },
    invalidate(): void {
      activeWave = undefined;
      actorIds.clear();
    },
  });
}

/** One source-owned stage identity shared by live and detached observations. */
export function canonicalObservationStage(index: number): TearStageId {
  const stage = stageIdAtRuntimeIndex(index);
  if (stage === null) throw new RangeError(`unregistered runtime stage index: ${String(index)}`);
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
