import { isObject, isRecord } from "../../domain/records";
import {
  legacyCosmeticEmissionSnapshot,
  parseCosmeticEmissionRandomSnapshot,
  type CosmeticEmissionRandomSnapshot,
} from "../../domain/cosmetic-emission-random";

/** The particle shapes. The particle system draws these; a snapshot stores them as plain data. */
export interface ParticleViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export type EffectPriority = "cosmetic" | "combat" | "hazard";
export interface ParticleBase {
  type: string;
  x: number;
  y: number;
  life: number;
  max: number;
  col?: string | null;
  priority?: EffectPriority;
}
export interface SparkParticle extends ParticleBase {
  type: "spark";
  vx: number;
  vy: number;
}
export interface RingParticle extends ParticleBase {
  type: "ring";
  r: number;
}
export interface RibbonParticle extends ParticleBase {
  type: "ribbon";
  x1: number;
  y1: number;
}
export interface EdgeTraceParticle extends ParticleBase {
  type: "edgeTrace";
  x1: number;
  y1: number;
  thickness: number;
}
export interface ContactMarkParticle extends ParticleBase {
  type: "contactMark";
  tx: number;
  ty: number;
  length: number;
  thickness: number;
}
export interface GroundPulseParticle extends ParticleBase {
  type: "groundPulse";
  nx: number;
  ny: number;
  halfWidth: number;
}
export interface MuzzleWedgeParticle extends ParticleBase {
  type: "muzzleWedge";
  dx: number;
  dy: number;
  length: number;
  halfWidth: number;
}
export interface ShardParticle extends ParticleBase {
  type: "shard";
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
}
export interface FlashParticle extends ParticleBase {
  type: "flash";
  r: number;
}
export interface ShockParticle extends ParticleBase {
  type: "shock";
  r: number;
  vr: number;
  thick: number;
}
export interface SmokeParticle extends ParticleBase {
  type: "smoke";
  vx: number;
  vy: number;
  size: number;
}
export interface GhostParticle extends ParticleBase {
  type: "ghost";
  hw: number;
  hh: number;
}
export interface EmberParticle extends ParticleBase {
  type: "ember";
  vx: number;
  vy: number;
  size: number;
}
export interface DripParticle extends ParticleBase {
  type: "drip";
  vx: number;
  vy: number;
  size: number;
}
export type ParticleShape =
  | SparkParticle
  | RingParticle
  | RibbonParticle
  | EdgeTraceParticle
  | ContactMarkParticle
  | GroundPulseParticle
  | MuzzleWedgeParticle
  | ShardParticle
  | FlashParticle
  | ShockParticle
  | SmokeParticle
  | GhostParticle
  | EmberParticle
  | DripParticle;
type Particle = ParticleShape;

export type ParticleEffectsPolicy = Readonly<{ highBudget: number; lowBudget: number; cullMargin: number }>;
export type ParticlePresentationPolicy = Readonly<{
  effects: ParticleEffectsPolicy;
  lowGraphics: boolean;
  reducedMotion: boolean;
}>;
type ParticlePresentationData = Readonly<{
  list: readonly Readonly<Particle>[];
  view: Readonly<ParticleViewRect> | null;
  replacementCursor: number;
  policy: ParticlePresentationPolicy;
}>;
export type ParticlePresentationCheckpoint = ParticlePresentationData &
  (Readonly<{ version: 1 }> | Readonly<{ version: 2; entropy: CosmeticEmissionRandomSnapshot }>);
export type PreparedParticlePresentationRestore = Readonly<{
  presentation: ParticlePresentationCheckpoint | undefined;
  entropy: CosmeticEmissionRandomSnapshot;
}>;

export function prepareParticlePresentationRestore(
  presentation: ParticlePresentationCheckpoint | undefined,
  runSeed: number,
  tick: number,
): PreparedParticlePresentationRestore {
  return Object.freeze({
    presentation,
    entropy: presentation?.version === 2 ? presentation.entropy : legacyCosmeticEmissionSnapshot(runSeed, tick),
  });
}

const variants: Readonly<Record<string, readonly string[]>> = Object.freeze({
  spark: ["vx", "vy"],
  ring: ["r"],
  ribbon: ["x1", "y1"],
  edgeTrace: ["x1", "y1", "thickness"],
  contactMark: ["tx", "ty", "length", "thickness"],
  groundPulse: ["nx", "ny", "halfWidth"],
  muzzleWedge: ["dx", "dy", "length", "halfWidth"],
  shard: ["vx", "vy", "rot", "spin", "size"],
  flash: ["r"],
  shock: ["r", "vr", "thick"],
  smoke: ["vx", "vy", "size"],
  ghost: ["hw", "hh"],
  ember: ["vx", "vy", "size"],
  drip: ["vx", "vy", "size"],
});

function data(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("particle presentation requires data objects");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("particle presentation requires plain objects");
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError("particle presentation contains unsupported fields or accessors");
    }
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError("particle presentation numbers must be finite");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("particle presentation policy flags must be booleans");
  return value;
}

function particle(value: unknown): Readonly<Particle> {
  // Inspect the discriminator without invoking a getter, before selecting its fields.
  if (!isObject(value)) throw new TypeError("particle must be data");
  const type = Object.getOwnPropertyDescriptor(value, "type");
  const name: unknown = type !== undefined && "value" in type ? type.value : undefined;
  if (typeof name !== "string" || !Object.hasOwn(variants, name)) throw new TypeError("unsupported particle type");
  const numeric = ["x", "y", "life", "max", ...(variants[name] ?? [])];
  const fields = data(value, ["type", ...numeric, "col", "priority"]);
  const result: Record<string, unknown> = { type: name };
  for (const key of numeric) result[key] = finite(fields[key]);
  if (Object.hasOwn(fields, "col")) {
    if (fields.col !== null && typeof fields.col !== "string")
      throw new TypeError("particle color must be a string or null");
    result.col = fields.col;
  }
  if (Object.hasOwn(fields, "priority")) {
    if (fields.priority !== "cosmetic" && fields.priority !== "combat" && fields.priority !== "hazard")
      throw new TypeError("unsupported particle priority");
    result.priority = fields.priority;
  }
  return Object.freeze(result) as unknown as Readonly<Particle>;
}

/** Exact presentation data only. Parsing never invokes emissions, accessors or entropy. */
export function parseParticlePresentationCheckpoint(value: unknown): ParticlePresentationCheckpoint | undefined {
  if (value === undefined) return undefined;
  const root = data(value, ["version", "list", "view", "replacementCursor", "policy", "entropy"]);
  if (root.version !== 1 && root.version !== 2) throw new RangeError("unsupported particle presentation version");
  if (root.version === 1 && Object.hasOwn(root, "entropy"))
    throw new RangeError("particle presentation v1 does not support entropy");
  const entropy = root.version === 2 ? parseCosmeticEmissionRandomSnapshot(root.entropy) : undefined;
  const policy = data(root.policy, ["effects", "lowGraphics", "reducedMotion"]);
  const effects = data(policy.effects, ["highBudget", "lowBudget", "cullMargin"]);
  const highBudget = finite(effects.highBudget),
    lowBudget = finite(effects.lowBudget),
    cullMargin = finite(effects.cullMargin);
  // Admission compares an integer length with the numeric budget. Fractions are legal.
  const capacity = Math.max(0, Math.ceil(Math.max(highBudget, lowBudget)));
  if (!Array.isArray(root.list) || root.list.length > capacity)
    throw new RangeError("particle presentation exceeds policy capacity");
  const list: Readonly<Particle>[] = [];
  const keys = Reflect.ownKeys(root.list);
  if (keys.length !== root.list.length + 1) throw new TypeError("particle list must be dense data without extensions");
  for (let index = 0; index < root.list.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(root.list, String(index));
    if (descriptor === undefined || !("value" in descriptor))
      throw new TypeError("particle list must not contain accessors or holes");
    list.push(particle(descriptor.value));
  }
  const view = root.view === null ? null : data(root.view, ["left", "top", "right", "bottom"]);
  const cursor = finite(root.replacementCursor);
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw new RangeError("particle replacement cursor must be a nonnegative safe integer");
  const parsed = {
    list: Object.freeze(list),
    view:
      view === null
        ? null
        : Object.freeze({
            left: finite(view.left),
            top: finite(view.top),
            right: finite(view.right),
            bottom: finite(view.bottom),
          }),
    replacementCursor: cursor,
    policy: Object.freeze({
      effects: Object.freeze({ highBudget, lowBudget, cullMargin }),
      lowGraphics: boolean(policy.lowGraphics),
      reducedMotion: boolean(policy.reducedMotion),
    }),
  };
  return entropy === undefined
    ? Object.freeze({ ...parsed, version: 1 })
    : Object.freeze({ ...parsed, version: 2, entropy });
}

/** Source settings are provenance; only structural tuning is bound to the restored config. */
export function validateParticlePresentationBinding(
  value: ParticlePresentationCheckpoint | undefined,
  effects: ParticleEffectsPolicy,
): void {
  if (
    value !== undefined &&
    (value.policy.effects.highBudget !== effects.highBudget ||
      value.policy.effects.lowBudget !== effects.lowBudget ||
      value.policy.effects.cullMargin !== effects.cullMargin)
  )
    throw new RangeError("particle presentation policy does not match candidate configuration");
}
