import type { TearSdlDocumentV1 } from "./tearsdl";

type Patch = Readonly<Record<string, unknown>>;

function patch(base: TearSdlDocumentV1, id: string, state: Patch): TearSdlDocumentV1 {
  return Object.freeze({
    ...base,
    id,
    state: Object.freeze({ ...base.state, ...structuredClone(state) }),
  });
}

export function forgeWaveState(
  base: TearSdlDocumentV1,
  wave: number,
  enemies: readonly Readonly<{ kind: string; count: number; hpScale?: number }>[],
): TearSdlDocumentV1 {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError("wave must be a positive safe integer");
  for (const entry of enemies) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) throw new RangeError("enemy counts must be non-negative");
  }
  return Object.freeze({
    ...patch(base, `${base.id}-wave-${String(wave)}`, { enemyComposition: enemies }),
    start: Object.freeze({ ...base.start, wave }),
  });
}

export function forgeBossFrameState(
  base: TearSdlDocumentV1,
  boss: string,
  phase: string,
  attack: string,
  frame: number,
): TearSdlDocumentV1 {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError("boss attack frame must be non-negative");
  return Object.freeze({
    ...patch(base, `${base.id}-${boss}-${phase}-${attack}-${String(frame)}`, {
      boss: Object.freeze({ id: boss, phase, attack, frame }),
    }),
    start: Object.freeze({ ...base.start, boss, bossPhase: phase }),
  });
}

export function forgeBladeAbilityState(
  base: TearSdlDocumentV1,
  blade: Readonly<{ state: string; x?: number; y?: number; vx?: number; vy?: number }>,
  abilities: Readonly<Record<string, Readonly<{ active: boolean; cooldownTicks: number }>>>,
): TearSdlDocumentV1 {
  return patch(base, `${base.id}-blade-${blade.state}`, {
    blade: Object.freeze(structuredClone(blade)),
    abilities: Object.freeze(structuredClone(abilities)),
  });
}

export function forgeUiDeviceState(
  base: TearSdlDocumentV1,
  ui: Readonly<{ screen: string; focusedId?: string; scroll?: number }>,
  device: Readonly<{ kind: "keyboard-mouse" | "gamepad" | "touch"; width: number; height: number }>,
): TearSdlDocumentV1 {
  if (!(device.width > 0) || !(device.height > 0)) throw new RangeError("device viewport must be positive");
  return patch(base, `${base.id}-${ui.screen}-${device.kind}`, {
    ui: Object.freeze(structuredClone(ui)),
    device: Object.freeze(structuredClone(device)),
  });
}

export interface TearOneFrameBoundaryDefinition {
  readonly id: string;
  readonly field: string;
  readonly before: number;
  readonly at: number;
  readonly after: number;
}

export function forgeOneFrameBoundaryStates(
  base: TearSdlDocumentV1,
  definition: TearOneFrameBoundaryDefinition,
): readonly TearSdlDocumentV1[] {
  return Object.freeze([
    patch(base, `${base.id}-${definition.id}-before`, { [definition.field]: definition.before }),
    patch(base, `${base.id}-${definition.id}-at`, { [definition.field]: definition.at }),
    patch(base, `${base.id}-${definition.id}-after`, { [definition.field]: definition.after }),
  ]);
}

export const DECLARED_ONE_FRAME_BOUNDARIES = Object.freeze([
  Object.freeze({ id: "hit-threshold", field: "bladeHitSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "perfect-parry", field: "perfectParrySpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "deflect", field: "deflectSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "slam", field: "slamSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "power-slam", field: "powerSlamSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "launch", field: "launchSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "recall-distance", field: "recallDistanceDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "overlap", field: "overlapDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "boss-hp", field: "bossHpDelta", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "cooldown", field: "cooldownTicks", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "iframe", field: "iframeTicks", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "shield", field: "shieldPips", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "style", field: "styleThresholdDelta", before: -1, at: 0, after: 1 }),
] as const);
