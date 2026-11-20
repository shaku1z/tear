import { MODE_CATALOG } from "../../gameplay/run/mode-catalog";
import { stageRuntimeIndexForSurface, type StageId } from "../../gameplay/stages";
import type { TearScenarioV1 } from "../../tearbench/contracts";
import { validateTearContract } from "../../tearbench/validation";

/** Waves in one stage of the Adventure: nine waves and the stage's boss. */
const CAMPAIGN_WAVES_PER_STAGE = 10;

/**
 * A run may open on a later wave, and in the Adventure that fixes its stage. The run is placed just before the
 * wave and the game's own planner starts it, so this admits only what that planner can start: a mode that counts
 * plain waves, and a stage that the wave belongs to.
 */
function requireWaveStart(value: TearScenarioV1): void {
  const { mode, stage } = value.start;
  const wave = value.start.wave ?? 1;
  const kind = MODE_CATALOG.find((entry) => entry.id === mode)?.classification;
  if (wave !== 1 && kind !== "campaign" && kind !== "endless")
    throw new RangeError(
      `a headless run in ${mode} mode opens on wave 1; only Adventure and Endless open on a later one`,
    );
  if (stage === undefined) return;
  if (kind !== "campaign") throw new RangeError("a headless run opens on a chosen stage only in the Adventure");
  const index = stageRuntimeIndexForSurface(stage as StageId, "adventure");
  if (index < 0) throw new RangeError(`the Adventure has no stage ${stage}`);
  if (Math.floor((wave - 1) / CAMPAIGN_WAVES_PER_STAGE) !== index) {
    const first = index * CAMPAIGN_WAVES_PER_STAGE + 1;
    throw new RangeError(
      `stage ${stage} is waves ${String(first)} to ${String(first + CAMPAIGN_WAVES_PER_STAGE - 1)} of the Adventure, not wave ${String(wave)}`,
    );
  }
}

function requireNaturalScenario(value: TearScenarioV1): TearScenarioV1 {
  if (value.backends !== undefined && !value.backends.includes("headless")) {
    throw new RangeError(`scenario ${value.id} does not support headless execution`);
  }
  if (value.subject?.kind === "environment-field" || value.subject?.kind === "environment-combat-object") {
    throw new RangeError(`scenario ${value.id} is environment-owned and requires the live backend`);
  }
  // A run opened on a chosen wave was not reached by play, and has to say so: it is surgical state, and nothing
  // that asks for a natural opening (a replay, a checkpoint) takes it for one.
  const chosenWave = (value.start.wave ?? 1) !== 1 || value.start.stage !== undefined;
  if (value.stateClass !== (chosenWave ? "surgical-valid" : "recorded-canonical")) {
    throw new RangeError(
      chosenWave
        ? "production headless runs require a natural opening; a run opened on a chosen wave or stage is surgical-valid state"
        : "production headless runs require recorded-canonical natural openings",
    );
  }
  // A chosen boss is a natural opening in boss-only mode: the player picks one on the start screen.
  if ((value.start.boss !== undefined && value.start.mode !== "bossonly") || value.start.bossPhase !== undefined) {
    throw new RangeError("production headless runs require a natural opening; use State Setup for surgical state");
  }
  requireWaveStart(value);
  return value;
}

/**
 * Admits a scenario the production headless environment can start: a valid contract with a natural opening, or one
 * that declares itself surgical and opens on a chosen wave.
 */
export function requireProductionHeadlessScenario(value: unknown): TearScenarioV1 {
  const validated = validateTearContract(value);
  if (!validated.ok || validated.value.kind !== "scenario") {
    throw new TypeError(
      `invalid headless scenario: ${
        validated.ok
          ? "wrong contract kind"
          : validated.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")
      }`,
    );
  }
  return requireNaturalScenario(validated.value);
}
