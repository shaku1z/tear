/**
 * Music catalog (R1).
 *
 * One Music Work exposes many versions (adaptive game cue, canonical OST, final
 * phase, instrumental, menu edit…). The player selects the *work*; this layer
 * picks the best version that is actually playable in the current context.
 */

export type CompatibilityClass = "A" | "B" | "C" | "D";

export type MusicRightsClaimKey =
  | "gameUse"
  | "streamSafe"
  | "vodSafe"
  | "albumRelease"
  | "commercialDistribution";

export type MusicRightsClaimStatus = "asserted" | "unknown" | "blocked" | "cleared";

export type MusicRightsClaimBasis = "owner-assertion" | "documented-clearance";

export type MusicRightsClaimReason = "no-clearance-record" | "program-hold";

export interface MusicRightsClaim {
  readonly status: MusicRightsClaimStatus;
  readonly basis?: MusicRightsClaimBasis;
  readonly reason?: MusicRightsClaimReason;
  readonly evidenceRef?: string;
}

/**
 * Additive rights metadata mirrored from the canonical music catalog.
 *
 * Game-use assertion and external-release clearance are intentionally separate:
 * a work can be playable in Tear while streaming, VOD, album, and commercial
 * distribution remain un-cleared.
 */
export interface MusicRights {
  readonly gameUse: boolean;
  readonly streamSafe: boolean;
  readonly vodSafe: boolean;
  readonly albumRelease: boolean;
  readonly commercialDistribution: boolean;
  readonly territories: readonly string[];
  readonly claims: Readonly<Record<MusicRightsClaimKey, MusicRightsClaim>>;
}

/** Where music is being asked to play. */
export type MusicContext = "shell" | "menu" | "shop" | "codex" | "gameplay" | "boss" | "victory" | "replay" | "archive";

export interface MusicVersion {
  readonly class: CompatibilityClass;
  readonly available: boolean;
  readonly adaptive?: boolean;
  readonly loopable?: boolean;
  readonly stemmed?: boolean;
  readonly linear?: boolean;
  readonly vocals?: boolean;
  readonly cue?: string;
  readonly contexts?: readonly MusicContext[];
  readonly bossIntro?: boolean;
  readonly status?: string;
}

export interface MusicWork {
  readonly id: string;
  readonly title: string;
  readonly category: "source-work" | "companion-work";
  readonly tempo: number;
  readonly key: string;
  readonly tags: readonly string[];
  readonly stations: readonly string[];
  readonly unlock: { readonly type: string; readonly bossId?: string; readonly biome?: string };
  readonly rights: MusicRights;
  readonly versions: Readonly<Record<string, MusicVersion>>;
}

export interface Station {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly selection: { readonly mode: string; readonly repeatProtection: number };
  readonly filters: { readonly tagsAny: readonly string[]; readonly adaptiveRequiredDuringGameplay: boolean };
  readonly contextRules: Readonly<Record<string, readonly string[]>>;
}

export interface MusicCatalog {
  readonly format: "tear-music-catalog";
  readonly version: 1;
  readonly works: readonly MusicWork[];
  readonly stations: readonly Station[];
  readonly [key: string]: unknown;
}

/** The format emitted by the pre-G4 authored catalog. It is read-only input. */
export interface LegacyMusicCatalog {
  readonly format: "tear-signal-catalog";
  readonly version: 1;
  readonly works: readonly MusicWork[];
  readonly stations: readonly Station[];
  readonly [key: string]: unknown;
}

export type MusicCatalogDocument = MusicCatalog | LegacyMusicCatalog;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse either catalog wire name and normalize it to the canonical Music form.
 * The normalization changes only the format discriminator; work, cue, station,
 * rights, and unknown extension fields are preserved byte-for-byte in memory.
 */
export function parseMusicCatalog(value: unknown): MusicCatalog {
  if (!isRecord(value) || value.version !== 1 ||
      (value.format !== "tear-music-catalog" && value.format !== "tear-signal-catalog") ||
      !Array.isArray(value.works) || !Array.isArray(value.stations)) {
    throw new TypeError("unsupported music catalog format/version");
  }
  return Object.freeze({ ...value, format: "tear-music-catalog", version: 1 }) as MusicCatalog;
}

/** Semantic content used by compatibility tests and future catalog integrity checks. */
export function musicCatalogSemanticProjection(catalog: MusicCatalogDocument): Readonly<{
  version: 1;
  works: readonly MusicWork[];
  stations: readonly Station[];
}> {
  return Object.freeze({ version: 1 as const, works: catalog.works, stations: catalog.stations });
}

/** Contexts that must never be handed a non-adaptive (linear) version. */
const ADAPTIVE_REQUIRED: ReadonlySet<MusicContext> = new Set(["gameplay", "boss"]);

/** Class D is a moment/stinger asset and is never general-purpose music. */
export function isSelectableAsBed(version: MusicVersion): boolean {
  return version.available && version.class !== "D";
}

/**
 * Choose the best available version of a work for a context.
 *
 * `allowedOrder` normally comes from the active station's `contextRules` and is a
 * strict allowlist in priority order — a station that programmes album versions
 * must not silently fall back to the adaptive game mix. When it is empty (no
 * station, i.e. a direct work pick) any context-legal version may be used.
 */
export function selectVersion(
  work: MusicWork,
  context: MusicContext,
  allowedOrder: readonly string[] = [],
): { versionId: string; version: MusicVersion } | null {
  const fits = (v: MusicVersion): boolean => {
    if (ADAPTIVE_REQUIRED.has(context) && v.adaptive !== true) return false;
    if (v.contexts && !v.contexts.includes(context)) return false;
    return true;
  };
  const usable = Object.entries(work.versions).filter(([, v]) => isSelectableAsBed(v) && fits(v));
  if (usable.length === 0) return null;

  if (allowedOrder.length > 0) {
    for (const id of allowedOrder) {
      const hit = usable.find(([versionId]) => versionId === id);
      if (hit) return { versionId: hit[0], version: hit[1] };
    }
    return null; // the station's programming is unavailable for this work here
  }
  // No station constraint: prefer the most capable version.
  const ranked = [...usable].sort((a, b) => score(b[1]) - score(a[1]));
  const best = ranked[0];
  return best ? { versionId: best[0], version: best[1] } : null;
}

function score(v: MusicVersion): number {
  return (v.adaptive ? 4 : 0) + (v.stemmed ? 2 : 0) + (v.loopable ? 1 : 0);
}

export function findWork(catalog: MusicCatalogDocument, workId: string): MusicWork | null {
  return catalog.works.find((w) => w.id === workId) ?? null;
}

export function findStation(catalog: MusicCatalogDocument, stationId: string): Station | null {
  return catalog.stations.find((s) => s.id === stationId) ?? null;
}

/** Works a station may draw from, honouring its tag filter and gameplay safety. */
export function stationWorks(
  catalog: MusicCatalogDocument,
  station: Station,
  context: MusicContext,
): readonly MusicWork[] {
  const order = station.contextRules[context] ?? [];
  return catalog.works.filter((work) => {
    if (!work.stations.includes(station.id)) return false;
    return selectVersion(work, context, order) !== null;
  });
}
