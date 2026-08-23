/**
 * Advanced Music Loadout (R5).
 *
 * Assigns music per context slot. Each slot carries a *policy* rather than a bare
 * id, so a player can say "inherit", "let the game choose", "this exact work",
 * "this station", "one of these with these odds", or "off".
 *
 * `inherit` is the important one: opening Shop or Codex must not restart the
 * shell track, and a biome without an explicit choice should fall through to the
 * broader gameplay slot rather than silently going canonical.
 */
import { selectVersion, type MusicCatalogDocument, type MusicContext } from "./catalog";
import { pickNext, type StationState } from "./station";

export type SlotId =
  | "shell" | "gameplay" | "boss" | "victory" | "defeat" | "replay"
  | "the-grounds" | "the-undercroft" | "the-crimson-fields" | "the-voidspire" | "the-tear";

export interface WeightedEntry {
  readonly workId: string;
  readonly weight: number;
}

export type MusicSelectionPolicy =
  | { readonly type: "inherit" }
  | { readonly type: "canonical" }
  | { readonly type: "station"; readonly stationId: string }
  | { readonly type: "work"; readonly workId: string; readonly version?: string }
  | { readonly type: "weighted-pool"; readonly entries: readonly WeightedEntry[] }
  | { readonly type: "off" };

/** Vocals can be distracting mid-combat even when the album version has them. */
export type VocalPolicy = "allow" | "instrumental-in-combat" | "never";

export interface AdvancedLoadout {
  readonly slots: Partial<Record<SlotId, MusicSelectionPolicy>>;
  readonly vocals: VocalPolicy;
}

export const DEFAULT_LOADOUT: AdvancedLoadout = { slots: {}, vocals: "instrumental-in-combat" };

/** Biome slots fall back to `gameplay`; everything else falls back to canonical. */
const PARENT: Partial<Record<SlotId, SlotId>> = {
  "the-grounds": "gameplay",
  "the-undercroft": "gameplay",
  "the-crimson-fields": "gameplay",
  "the-voidspire": "gameplay",
  "the-tear": "gameplay",
  boss: "gameplay",
};

/** Resolve a slot's policy, walking `inherit` up the parent chain. */
export function effectivePolicy(loadout: AdvancedLoadout, slot: SlotId): MusicSelectionPolicy {
  const seen = new Set<SlotId>();
  let current: SlotId | undefined = slot;
  while (current && !seen.has(current)) {
    seen.add(current);
    const policy = loadout.slots[current];
    if (policy && policy.type !== "inherit") return policy;
    current = PARENT[current];
  }
  return { type: "canonical" };
}

export interface ResolveOptions {
  readonly catalog: MusicCatalogDocument;
  readonly context: MusicContext;
  readonly stationState: StationState;
  readonly seed: number;
  /** Cue ids actually loaded and playable. */
  readonly isLoaded: (workId: string) => boolean;
}

export interface Resolution {
  readonly kind: "canonical" | "work" | "off";
  readonly workId?: string;
  readonly versionId?: string;
}

function poolPick(entries: readonly WeightedEntry[], seed: number): string | null {
  const usable = entries.filter((e) => e.weight > 0);
  if (usable.length === 0) return null;
  const total = usable.reduce((sum, e) => sum + e.weight, 0);
  // Deterministic: same seed and pool always yields the same entry.
  let roll = ((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296) * total;
  for (const entry of usable) {
    roll -= entry.weight;
    if (roll <= 0) return entry.workId;
  }
  return usable[usable.length - 1]?.workId ?? null;
}

/** Turn a slot into a concrete choice, or `canonical` when nothing applies. */
export function resolveSlot(
  loadout: AdvancedLoadout,
  slot: SlotId,
  options: ResolveOptions,
): Resolution {
  const policy = effectivePolicy(loadout, slot);
  const { catalog, context, isLoaded } = options;

  if (policy.type === "off") return { kind: "off" };
  if (policy.type === "canonical") return { kind: "canonical" };

  if (policy.type === "work") {
    const work = catalog.works.find((w) => w.id === policy.workId);
    if (!work || !isLoaded(work.id)) return { kind: "canonical" };
    const picked = selectVersion(work, context, policy.version ? [policy.version] : []);
    return picked ? { kind: "work", workId: work.id, versionId: picked.versionId } : { kind: "canonical" };
  }

  if (policy.type === "weighted-pool") {
    const workId = poolPick(policy.entries, options.seed);
    if (!workId || !isLoaded(workId)) return { kind: "canonical" };
    const work = catalog.works.find((w) => w.id === workId);
    const picked = work ? selectVersion(work, context) : null;
    return picked ? { kind: "work", workId, versionId: picked.versionId } : { kind: "canonical" };
  }

  // `effectivePolicy` resolves inherit, but keep this boundary total in case its
  // contract changes or malformed persisted data reaches the resolver.
  if (policy.type !== "station") return { kind: "canonical" };

  const entry = pickNext(catalog, policy.stationId, context, options.stationState, options.seed);
  if (!entry || !isLoaded(entry.workId)) return { kind: "canonical" };
  return { kind: "work", workId: entry.workId, versionId: entry.versionId };
}

/** Should this context play an instrumental version instead of the vocal one? */
export function prefersInstrumental(vocals: VocalPolicy, context: MusicContext): boolean {
  if (vocals === "never") return true;
  if (vocals === "instrumental-in-combat") return context === "gameplay" || context === "boss";
  return false;
}

/** Map a biome/stage name onto its slot id. */
export function slotForBiome(biomeId: string): SlotId | null {
  const key = biomeId.trim().toLowerCase().replace(/\s+/gu, "-");
  const slots: readonly SlotId[] = [
    "the-grounds", "the-undercroft", "the-crimson-fields", "the-voidspire", "the-tear",
  ];
  return slots.find((s) => s === key) ?? null;
}
