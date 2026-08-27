import type {
  MusicRoutingContext,
  MusicRoutingManifest,
  MusicRoutingRule,
} from "./music-routing-types";

/**
 * Feature-branch safety net for stages whose reviewed soundtrack release has
 * not shipped yet. These selections are deliberately kept out of the public
 * routing manifest: they are playable engineering fallbacks, not canonical
 * music assignments.
 */
export const ENGINEERING_ONLY_BIOME_MUSIC_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  "the-verdant-sanctum": "fillet",
});

function normalizeBiome(value: string): string {
  const lower = value.trim().toLowerCase().replace(/\s+/gu, "-");
  const aliases: Readonly<Record<string, string>> = {
    grounds: "the-grounds",
    "the-grounds": "the-grounds",
    undercroft: "the-undercroft",
    "the-undercroft": "the-undercroft",
    crimson: "the-crimson-fields",
    "the-crimson-fields": "the-crimson-fields",
    void: "the-voidspire",
    voidspire: "the-voidspire",
    "the-voidspire": "the-voidspire",
    tear: "the-tear",
    "the-tear": "the-tear",
  };
  return aliases[lower] ?? lower;
}

function matches(rule: MusicRoutingRule, context: MusicRoutingContext): boolean {
  const match = rule.match;
  if (match.scene !== undefined && match.scene !== context.scene) return false;
  if (
    match.biome !== undefined &&
    normalizeBiome(match.biome) !== normalizeBiome(context.biomeId)
  )
    return false;
  if (match.bossId !== undefined && match.bossId !== context.bossId) return false;
  if (match.bossRequired === true && !context.bossId) return false;
  return true;
}

function specificity(rule: MusicRoutingRule): number {
  const match = rule.match;
  return (match.scene === undefined ? 0 : 1)
    + (match.biome === undefined ? 0 : 8)
    + (match.bossRequired ? 16 : 0)
    + (match.bossId === undefined ? 0 : 32);
}

function choosePool(
  candidates: readonly { readonly workId: string; readonly weight: number }[],
  seed: number,
): string | null {
  const usable = candidates.filter((entry) => entry.weight > 0).sort((a, b) => a.workId.localeCompare(b.workId));
  const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;
  let roll = ((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296) * total;
  for (const entry of usable) {
    roll -= entry.weight;
    if (roll <= 0) return entry.workId;
  }
  return usable.at(-1)?.workId ?? null;
}

/** Pure resolver: every caller gets the same result for the same context/seed. */
export function resolveMusicRoute(
  manifest: MusicRoutingManifest,
  context: MusicRoutingContext,
  seed = 1,
): string {
  let matchesForContext = manifest.rules.filter((rule) => matches(rule, context));
  // A boss or terminal moment with no dedicated route inherits its biome's
  // normal gameplay bed, exactly as the legacy map did.
  if (matchesForContext.length === 0 && context.scene !== "gameplay" && context.scene !== "menu") {
    matchesForContext = manifest.rules.filter((rule) => matches(rule, { ...context, scene: "gameplay" }));
  }
  if (matchesForContext.length === 0) {
    return ENGINEERING_ONLY_BIOME_MUSIC_FALLBACKS[normalizeBiome(context.biomeId)]
      ?? manifest.defaultWorkId;
  }
  const maxSpecificity = Math.max(...matchesForContext.map(specificity));
  const scoped = matchesForContext.filter((rule) => specificity(rule) === maxSpecificity);
  const maxPriority = Math.max(...scoped.map((rule) => rule.priority ?? 0));
  const ranked = scoped.filter((rule) => (rule.priority ?? 0) === maxPriority).sort((a, b) => a.id.localeCompare(b.id));
  const primary = ranked.find((rule) => rule.selection.type === "primary");
  if (primary?.selection.type === "primary") return primary.selection.workId;
  const pool = ranked.flatMap((rule) => rule.selection.type === "weighted-pool" ? rule.selection.entries : []);
  return choosePool(pool, seed) ?? manifest.defaultWorkId;
}
