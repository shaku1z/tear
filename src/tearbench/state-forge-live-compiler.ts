import { stableVerificationHash } from "../replay/hash";
import { stageRuntimeIndexForSurface, type StageId } from "../gameplay/stages";
import { findVariant } from "../gameplay/variants";
import type { TearSnapshotV1 } from "./contracts";
import type { TearSdlResolved } from "./tearsdl";
import { validateAuthoredEnvironmentCodecPayload as validateEnvironmentCodecPayload } from "./authored-environment-codec-validation";

type MutableRecord = Record<string, unknown>;

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function record(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as MutableRecord;
}

function patchRecord(target: MutableRecord, patch: unknown, label: string): void {
  if (patch === undefined) return;
  Object.assign(target, structuredClone(record(patch, label)));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function enemyPayload(
  kind: string,
  id: string,
  index: number,
  position?: Readonly<{ x: number; y: number }>,
  variantId?: string,
): Readonly<Record<string, unknown>> {
  const variant = variantId === undefined ? undefined : findVariant(kind, variantId);
  if (variantId !== undefined && variant === null) throw new RangeError(`unknown ${kind} variant in State Forge: ${variantId}`);
  const variantProbe = variant === undefined ? undefined : { behavior: "", contactReach: 0, speedMult: 1, hp: 1, maxHp: 1 };
  if (variant !== undefined && variant !== null && variantProbe !== undefined) variant.apply(variantProbe);
  return Object.freeze({
    id,
    factoryId: kind,
    x: position?.x ?? 260 + (index % 8) * 130,
    y: position?.y ?? 620 - Math.floor(index / 8) * 80,
    ...(variantId === undefined ? {} : { variantId }),
    ...(variantProbe === undefined ? {} : { behavior: variantProbe.behavior }),
  });
}

function compositionPosition(spec: MutableRecord, count: number): Readonly<{ x: number; y: number }> | undefined {
  const x = spec.x, y = spec.y;
  if (x === undefined && y === undefined) return undefined;
  if (count !== 1 || typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)
    || x < 0 || x > 1600 || y < 0 || y > 800) {
    throw new RangeError("positioned enemy composition requires exactly one finite actor within the authored 1600x800 arena");
  }
  return Object.freeze({ x, y });
}

function patchEnemyComposition(snapshot: TearSnapshotV1, composition: unknown): void {
  if (!Array.isArray(composition)) return;
  const payloads: Readonly<Record<string, unknown>>[] = [];
  for (const entry of composition) {
    const spec = record(entry, "enemy composition entry");
    const kind = typeof spec.kind === "string" ? spec.kind : "charger";
    const count = finite(spec.count, 0);
    if (!Number.isSafeInteger(count) || count < 0 || count > 200) {
      throw new RangeError("enemy composition count must be an integer from 0 through 200");
    }
    const position = compositionPosition(spec, count);
    for (let index = 0; index < count; index += 1) {
      // The live combat identity owner accepts its canonical numeric namespace
      // only.  State Forge must stage real actors through that same namespace,
      // rather than smuggling descriptive test IDs into production restore.
      const variantId = typeof spec.variantId === "string" && spec.variantId.trim() !== ""
        ? spec.variantId : undefined;
      payloads.push(enemyPayload(kind, `enemy:${String(payloads.length + 1)}`, payloads.length, position, variantId));
    }
  }
  (snapshot.state as MutableRecord)["tear.enemy.v1"] = Object.freeze(payloads);
}

function patchEnvironment(snapshot: TearSnapshotV1, environment: unknown, expectedStageId?: string): void {
  if (environment === undefined) return;
  const value = record(environment, "environment forge payload");
  const issues = validateEnvironmentCodecPayload({ slowZones: [], walls: [], ...value });
  const firstIssue = issues[0];
  if (firstIssue !== undefined) throw new TypeError(`environment forge payload is invalid: ${firstIssue.path} ${firstIssue.message}`);
  const hazard = record(snapshot.state["tear.hazard.v1"], "hazard codec");
  if (expectedStageId !== undefined && value.stageId !== undefined && value.stageId !== expectedStageId) {
    throw new RangeError("environment forge stage does not match the resolved scenario stage");
  }
  if (typeof hazard.worldId === "string" && typeof value.worldId === "string" && hazard.worldId !== value.worldId) {
    throw new RangeError("environment forge world identity does not match the source snapshot");
  }
  hazard.fields = structuredClone(value.fields);
  hazard.combatObjects = structuredClone(value.combatObjects);
  hazard.routes = structuredClone(value.routes);
}

/** Rebase stage-owned temporal records to the forged fixed-tick origin. */
function rebaseEnvironmentOrigin(snapshot: TearSnapshotV1): void {
  const hazard = record(snapshot.state["tear.hazard.v1"], "hazard codec");
  for (const key of ["fields", "combatObjects", "routes"] as const) {
    const entries = hazard[key];
    if (!isUnknownArray(entries)) continue;
    hazard[key] = entries.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return entry;
      const value = { ...(entry as Record<string, unknown>) };
      if (typeof value.stateTick === "number") value.stateTick = 0;
      return value;
    });
  }
}

function patchExactStage(run: MutableRecord, stageId: string | undefined, wave: number, stateClass?: string): void {
  if (stageId === undefined) return;
  const previewSurgical = stageId === "pale-traverse" && stateClass === "surgical-valid";
  const surface = run.mode === "playground" || previewSurgical ? "playground" : "adventure";
  const stageIndex = stageRuntimeIndexForSurface(stageId as StageId, surface);
  if (stageIndex < 0) throw new RangeError(`resolved scenario stage does not exist: ${stageId}`);
  if (run.mode === "campaign" && Math.floor((wave - 1) / 10) !== stageIndex) {
    throw new RangeError("campaign wave does not belong to the resolved scenario stage");
  }
  run.stage = stageIndex;
  run._biomeIdx = stageIndex;
}

/** Compiles resolved TearSDL into a detached live-codec snapshot. */
export function compileResolvedTearSdlSnapshot(
  source: TearSnapshotV1,
  resolved: TearSdlResolved,
): TearSnapshotV1 {
  if (!resolved.structural.valid) throw new TypeError("cannot compile structurally invalid TearSDL");
  const forged = structuredClone(source);
  const mutable = forged as unknown as MutableRecord;
  mutable.id = resolved.document.id;
  mutable.stateClass = resolved.document.stateClass;
  mutable.seed = resolved.document.seed;
  const state = resolved.document.state ?? {};
  const run = record(forged.state["tear.run.v1"], "run codec");
  const player = record(forged.state["tear.player.v1"], "player codec");
  const blade = record(forged.state["tear.blade.v1"], "blade codec");
  const ui = record(forged.state["tear.ui.v1"], "ui codec");
  const world = record(forged.state["tear.world.v1"], "world codec");
  run.mode = resolved.scenario.start.mode;
  run.difficulty = resolved.scenario.start.difficulty;
  run.diff = resolved.scenario.start.difficulty;
  run.weaponId = resolved.scenario.start.weapon;
  // The boss lookup used to obtain the production source snapshot may advance
  // one fixed tick before the actor exists. A forged scenario is a fresh
  // deterministic origin, so do not leak that lookup tick into the action
  // envelope contract or the first submitted command will target the wrong
  // fixed tick.
  mutable.tick = 0;
  run.tick = 0;
  const worldClock = forged.state["tear.world.v1"];
  if (worldClock !== undefined) record(worldClock, "world codec").clock = 0;
  const wave = resolved.scenario.start.wave ?? 1;
  run.wave = wave;
  patchExactStage(run, resolved.scenario.start.stage, wave, resolved.document.stateClass);
  if (typeof state.playerHp === "number") player.hp = state.playerHp;
  if (typeof state.playerMaxHp === "number") player.maxHp = state.playerMaxHp;
  if (typeof state.playerHpRatio === "number") player.hp = Number(player.maxHp) * state.playerHpRatio;
  patchRecord(player, state.player, "player patch");
  patchRecord(blade, state.blade, "blade patch");
  patchRecord(ui, state.ui, "UI patch");
  if (state.device !== undefined) world.device = structuredClone(state.device);
  if (state.abilities !== undefined) run.stateForgeAbilities = structuredClone(state.abilities);
  if (state.boss !== undefined) {
    const bosses = forged.state["tear.boss.v1"];
    if (!Array.isArray(bosses) || bosses.length === 0) throw new TypeError("boss patch requires a live boss source");
    patchRecord(record(bosses[0], "boss codec"), state.boss, "boss patch");
  }
  patchEnemyComposition(forged, state.enemyComposition);
  patchEnvironment(forged, state.environment, resolved.document.start.stage);
  for (const [key, value] of Object.entries(state)) {
    if (key.startsWith("tear.") && key.endsWith(".v1")) {
      patchRecord(record(forged.state[key], `${key} codec`), value, `${key} patch`);
    }
  }
  rebaseEnvironmentOrigin(forged);
  run.stateForgeScenario = Object.freeze({
    id: resolved.document.id,
    stateClass: resolved.document.stateClass,
    reachability: resolved.reachability,
    plausibility: resolved.plausibility,
    resolvedHash: resolved.resolvedHash,
  });
  mutable.hashes = Object.freeze({ ...forged.hashes, exact: stableVerificationHash(forged.state) });
  return Object.freeze(forged);
}
