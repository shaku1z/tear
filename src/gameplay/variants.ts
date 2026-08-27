// ------- enemy variants: distinct "evolutions" of each base family -------
// The ~35 named foes from the design docs don't need 35 classes. A FAMILY defines
// the verbs (Charger comes at you, Ranged makes you come to it, Flyer owns the air);
// a VARIANT reshapes those verbs into a distinct threat; AFFIXES (affixes.js) then
// tint/scale on top. So "Swift Armed Stalker" late-game reads nothing like a wave-1
// Charger, with no combinatorial class explosion.
//
// Each variant sets e.behavior (the AI branch its family.update() switches on) plus
// light stat tweaks. Variants are weighted and gated by wave so the roster unfolds
// as a run/campaign progresses.

import type { RandomSource } from "../domain/random";
import type { StageId } from "./stages";
import type { RunMode } from "./run/session";

/**
 * All inputs that can affect an authored variant roll.  Keeping the stage,
 * local wave, and global wave together prevents a high endless wave (or the
 * sandbox's compatibility wave 99) from accidentally unlocking campaign
 * content.  The random source is always supplied by the run composition.
 */
export interface VariantSelectionContext {
  readonly stageId: StageId;
  readonly localWave: number;
  readonly globalWave: number;
  readonly mode: RunMode;
  readonly random: RandomSource;
  readonly discoveredVariantIds?: readonly string[];
  /** Explicit selection is intentionally limited to Playground and Enemy Test. */
  readonly explicitVariantId?: string;
}

export interface VariantEnemy {
  kind?: string;
  behavior: string;
  contactReach: number;
  speedMult: number;
  hp: number;
  maxHp: number;
  weight?: number;
  duelReady?: boolean;
  variant?: string;
  variantName?: string;
}

export interface EnemyVariant {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly minWave?: number;
  readonly apply: (enemy: VariantEnemy) => void;
}

const VARIANTS: Readonly<Record<string, readonly EnemyVariant[]>> = {
  charger: [
    { id: "bull",        name: "Charger",     weight: 1.0,             apply: (e) => { e.behavior = "bull"; } },
    { id: "brawler",     name: "Brawler",     weight: 0.8, minWave: 2, apply: (e) => { e.behavior = "brawler"; e.contactReach = Math.max(e.contactReach, 10); } },
    { id: "stalker",     name: "Stalker",     weight: 0.7, minWave: 4, apply: (e) => { e.behavior = "stalker"; e.speedMult *= 1.3; e.hp *= 0.78; e.maxHp *= 0.78; } },
    { id: "executioner", name: "Executioner", weight: 0.5, minWave: 6, apply: (e) => { e.behavior = "executioner"; e.hp *= 1.3; e.maxHp *= 1.3; e.speedMult *= 0.7; } },
    { id: "gravedigger", name: "Gravedigger", weight: 0.5, minWave: 5, apply: (e) => { e.behavior = "gravedigger"; e.hp *= 1.4; e.maxHp *= 1.4; e.speedMult *= 0.6; } },
    { id: "duelist",     name: "Duelist",     weight: 0.5, minWave: 6, apply: (e) => { e.behavior = "duelist"; e.contactReach = Math.max(e.contactReach, 12); e.duelReady = true; } },
    // Verdant content reuses the authored Charger verbs; the gate below is
    // source-owned so it cannot leak into existing campaign stages.
    { id: "briar-stalker", name: "Briar Stalker", weight: 0.55, minWave: 4, apply: (e) => { e.behavior = "briar-stalker"; e.speedMult *= 1.18; } },
  ],
  ranged: [
    { id: "sentinel", name: "Sentinel", weight: 1.0,             apply: (e) => { e.behavior = "sentinel"; } },
    { id: "rifleman", name: "Rifleman", weight: 0.8, minWave: 3, apply: (e) => { e.behavior = "rifleman"; } },
    { id: "marksman", name: "Marksman", weight: 0.6, minWave: 5, apply: (e) => { e.behavior = "marksman"; e.hp *= 1.1; e.maxHp *= 1.1; } },
    { id: "warlock",  name: "Warlock",  weight: 0.55, minWave: 6, apply: (e) => { e.behavior = "warlock"; } },
    { id: "chain",    name: "Chain Caster", weight: 0.5, minWave: 7, apply: (e) => { e.behavior = "chain"; } },
    { id: "seedcaster", name: "Seedcaster", weight: 0.5, minWave: 5, apply: (e) => { e.behavior = "seedcaster"; e.speedMult *= 0.92; } },
  ],
  flyer: [
    { id: "swooper",    name: "Flyer",       weight: 1.0,             apply: (e) => { e.behavior = "swoop"; } },
    { id: "divebomber", name: "Dive Bomber", weight: 0.8, minWave: 3, apply: (e) => { e.behavior = "divebomb"; } },
    { id: "highdiver",  name: "Swooper",     weight: 0.6, minWave: 5, apply: (e) => { e.behavior = "highdive"; } },
    { id: "canopy-diver", name: "Canopy Diver", weight: 0.5, minWave: 4, apply: (e) => { e.behavior = "canopy-diver"; } },
  ],
  bomber: [
    { id: "lobber",    name: "Bomber",    weight: 1.0,             apply: (e) => { e.behavior = "lob"; } },
    { id: "juggler",   name: "Juggler",   weight: 0.7, minWave: 4, apply: (e) => { e.behavior = "juggle"; } },
    { id: "trapper",   name: "Trapper",   weight: 0.6, minWave: 3, apply: (e) => { e.behavior = "trap"; } },
    { id: "sludge",    name: "Sludge",    weight: 0.5, minWave: 5, apply: (e) => { e.behavior = "sludge"; } },
    { id: "geomancer", name: "Geomancer", weight: 0.45, minWave: 7, apply: (e) => { e.behavior = "geo"; e.hp *= 1.2; e.maxHp *= 1.2; } },
  ],
  // armored keeps its baseline (turn-to-face + enrage on shield break); an absent
  // list just means "no variant, use the family default". Bark Sentinel is
  // deliberately the same shielded Armored family, not a second hard-root
  // implementation.
  armored: [
    { id: "bark-sentinel", name: "Bark Sentinel", weight: 0.45, minWave: 5, apply: (e) => { e.behavior = "bark-sentinel"; e.speedMult *= 0.82; if (e.weight !== undefined) e.weight *= 1.25; } },
  ],
};

export const VERDANT_VARIANT_IDS = Object.freeze([
  "briar-stalker", "seedcaster", "canopy-diver", "bark-sentinel",
] as const);
const VERDANT_VARIANT_ID_SET: ReadonlySet<string> = new Set(VERDANT_VARIANT_IDS);

function assertWave(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer`);
}

function chooseWeighted(list: readonly EnemyVariant[], random: RandomSource): EnemyVariant | null {
  if (!list.length) return null;
  let total = 0;
  for (const variant of list) total += variant.weight;
  let cursor = random.next() * total;
  for (const variant of list) {
    cursor -= variant.weight;
    if (cursor <= 0) return variant;
  }
  return list[0] ?? null;
}

/** Resolve a serialized selected identity without exposing executable callbacks. */
export function findVariant(kind: string, id: string): EnemyVariant | null {
  return (VARIANTS[kind] ?? []).find((variant) => variant.id === id) ?? null;
}

export function isVerdantVariant(id: string): boolean {
  return VERDANT_VARIANT_ID_SET.has(id);
}

/**
 * Resolves the persisted profile discovery authority into a run-owned list.
 * Endless/Gauntlet discovery is intentionally earned by having entered the
 * authored Verdant biome; a large global wave never substitutes for it.
 */
export function resolveDiscoveredVariantIds(mode: RunMode, discoveredBiomes: readonly string[]): readonly string[] {
  if (mode !== "endless" && mode !== "gauntlet") return [];
  const seenVerdantSanctum = discoveredBiomes.some((biome) => {
    const normalized = biome.trim().toLowerCase().replaceAll("-", " ");
    return normalized === "verdant sanctum" || normalized === "the verdant sanctum";
  });
  return seenVerdantSanctum ? VERDANT_VARIANT_IDS : [];
}

/**
 * Context-aware, fail-closed variant selection. Existing families continue to
 * use their historical wave gates; only the four Verdant identities require
 * the authored stage/mode/discovery conditions below.
 */
export function selectVariant(kind: string, context: VariantSelectionContext): EnemyVariant | null {
  assertWave(context.localWave, "localWave");
  assertWave(context.globalWave, "globalWave");
  const variants = VARIANTS[kind] ?? [];
  if (context.explicitVariantId !== undefined
    && (context.mode === "playground" || context.mode === "sandbox")) {
    return findVariant(kind, context.explicitVariantId);
  }
  const discovered = new Set(context.discoveredVariantIds ?? []);
  const eligible = variants.filter((variant) => {
    if (isVerdantVariant(variant.id)) {
      if (context.mode === "campaign") return context.stageId === "verdant-sanctum" && context.localWave >= (variant.minWave ?? 1);
      if (context.mode === "endless" || context.mode === "gauntlet") {
        return discovered.has(variant.id) && context.localWave >= (variant.minWave ?? 1);
      }
      return false;
    }
    // Legacy variants have always been gated by the run's global/content wave.
    // Keep that contract in campaign too; only Verdant identities use the
    // authored stage + local-wave gate above.
    const gateWave = context.globalWave;
    return variant.minWave === undefined || gateWave >= variant.minWave;
  });
  return chooseWeighted(eligible, context.random);
}

// Legacy wave-only entry point retained for existing callers and recordings.
// New production code should pass the complete context overload.
function rollVariant(kind: string, wave: number, random: RandomSource): EnemyVariant | null;
function rollVariant(kind: string, context: VariantSelectionContext): EnemyVariant | null;
function rollVariant(kind: string, waveOrContext: number | VariantSelectionContext, random?: RandomSource): EnemyVariant | null {
  if (typeof waveOrContext !== "number") return selectVariant(kind, waveOrContext);
  const wave = waveOrContext;
  if (random === undefined) throw new TypeError("legacy variant rolls require an injected random source");
  const list = (VARIANTS[kind] ?? []).filter((v) => !isVerdantVariant(v.id) && (v.minWave === undefined || wave >= v.minWave));
  if (!list.length) return null;
  let total = 0; for (const v of list) total += v.weight;
  let r = random.next() * total;
  for (const v of list) { if ((r -= v.weight) <= 0) return v; }
  return list[0] ?? null;
}

function applyVariant(e: VariantEnemy, v: EnemyVariant | null | undefined): void {
  if (!v) return;
  e.variant = v.id;
  e.variantName = v.name;
  v.apply(e);
}

export { VARIANTS, applyVariant, rollVariant };
