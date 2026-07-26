import type { TearDifficultyId, TearRunModeId, TearWeaponId } from "./registries";
import {
  reconstructProgression,
  type TearProgressionLedger,
} from "./progression-ledger";

export interface TearProgressionReplayPorts {
  resetConfiguration(revision: string): void;
  setupRun(mode: TearRunModeId, difficulty: TearDifficultyId): void;
  selectWeapon(weapon: TearWeaponId): void;
  applyMeta(id: string, value: number): void;
  applyDraft(id: string, occurrence: number): void;
  applyTier(id: string, tier: number): void;
}

export interface TearProgressionReplayResult {
  readonly appliedMutationCount: number;
  readonly earnedPickCount: number;
  readonly finalBuild: Readonly<Record<string, number>>;
  readonly configurationHash: string;
}

/**
 * Replays only the configuration-affecting portion of a validated canonical
 * ledger. The event walk is intentionally ordered: reset, difficulty setup,
 * weapon chassis, meta, then each production draft/tier mutation.
 */
export function replayProgressionConfiguration(
  ledger: TearProgressionLedger,
  ports: TearProgressionReplayPorts,
): TearProgressionReplayResult {
  const reconstruction = reconstructProgression(ledger);
  let pending:
    | Readonly<{ source: "draft" | "tier"; id: string; tier: number }>
    | undefined;
  let appliedMutationCount = 0;
  let earnedPickCount = 0;
  for (const event of ledger.events) {
    switch (event.type) {
      case "configuration.reset":
        ports.resetConfiguration(event.revision);
        break;
      case "run.setup":
        ports.setupRun(event.mode, event.difficulty);
        break;
      case "weapon.selected":
        ports.selectWeapon(event.weapon);
        break;
      case "meta.applied":
        ports.applyMeta(event.id, event.value);
        break;
      case "draft.earned":
      case "tier.earned":
        earnedPickCount += 1;
        break;
      case "draft.selected":
        pending = Object.freeze({ source: "draft", id: event.id, tier: event.tier });
        break;
      case "tier.selected":
        pending = Object.freeze({ source: "tier", id: event.id, tier: event.tier });
        break;
      case "configuration.mutated":
        if (pending?.source !== event.source || pending.id !== event.id
          || pending.tier !== event.tier) {
          throw new TypeError(`configuration mutation ${event.id} is not paired with its selected reward`);
        }
        if (event.source === "draft") ports.applyDraft(event.id, event.occurrence);
        else ports.applyTier(event.id, event.tier);
        pending = undefined;
        appliedMutationCount += 1;
        break;
      default:
        break;
    }
  }
  if (pending !== undefined) throw new TypeError(`selected reward ${pending.id} has no configuration mutation`);
  if (appliedMutationCount !== earnedPickCount) {
    throw new TypeError(
      `configuration mutation count ${String(appliedMutationCount)} does not match earned pick count ${String(earnedPickCount)}`,
    );
  }
  return Object.freeze({
    appliedMutationCount,
    earnedPickCount,
    finalBuild: reconstruction.build,
    configurationHash: reconstruction.configurationHash,
  });
}
