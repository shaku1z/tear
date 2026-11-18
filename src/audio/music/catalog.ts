/**
 * Music catalog (R1).
 *
 * One Music Work exposes many versions (adaptive game cue, canonical OST, final
 * phase, instrumental, menu edit…). The player selects the *work*; this layer
 * picks the best version that is actually playable in the current context.
 */
import { conditionFrom, conditionProblems, type UnlockCondition } from "../../domain/unlock-condition";

export type CompatibilityClass = "A" | "B" | "C" | "D";

export type MusicRightsClaimKey = "gameUse" | "streamSafe" | "vodSafe" | "albumRelease" | "commercialDistribution";

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
  /** The cue plays a one-shot intro before its loop the first time it starts in a run. */
  readonly openingIntro?: boolean;
  readonly status?: string;
}

/**
 * A work's requirement. "unreadable" is a condition this build cannot read (a newer kind from a newer
 * catalog): the work can never unlock here, and the reason is in the catalog's `problems`.
 */
export type MusicUnlock = UnlockCondition | Readonly<{ type: "unreadable" }>;

export interface MusicWork {
  readonly id: string;
  readonly title: string;
  readonly category: "source-work" | "companion-work";
  readonly tempo: number;
  readonly key: string;
  readonly tags: readonly string[];
  /** What the player must have done to hear it, in the shared condition language. */
  readonly unlock: MusicUnlock;
  /** `calm` or `intense`; the Radio's mood channels select by it. Absent in older catalogs. */
  readonly mood?: string;
  readonly rights: MusicRights;
  readonly versions: Readonly<Record<string, MusicVersion>>;
}

export interface MusicCatalog {
  readonly format: "tear-music-catalog";
  readonly version: 1;
  readonly works: readonly MusicWork[];
  /** Why any work's unlock could not be read; empty for a catalog this build fully understands. */
  readonly problems: readonly string[];
  /** Radio channels and song length: read only through `parseRadioProgramme`, which validates them. */
  readonly channels?: unknown;
  readonly radio?: unknown;
  readonly [key: string]: unknown;
}

/** The format emitted by the pre-G4 authored catalog. It is read-only input. */
export interface LegacyMusicCatalog {
  readonly format: "tear-signal-catalog";
  readonly version: 1;
  readonly works: readonly MusicWork[];
  readonly [key: string]: unknown;
}

export type MusicCatalogDocument = MusicCatalog | LegacyMusicCatalog;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse either catalog wire name and normalize it to the canonical Music form.
 * The normalization changes only the format discriminator; work, cue, rights and
 * unknown extension fields (a retired `stations` list among them) are kept in memory.
 */
export function parseMusicCatalog(value: unknown): MusicCatalog {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.format !== "tear-music-catalog" && value.format !== "tear-signal-catalog") ||
    !Array.isArray(value.works)
  ) {
    throw new TypeError("unsupported music catalog format/version");
  }
  const base = { ...value, format: "tear-music-catalog", version: 1 } as MusicCatalog;
  const problems: string[] = [];
  const works = base.works.map((work) => {
    const known: Record<string, unknown> = isRecord(work) ? work : {};
    const unlock = conditionFrom(known.unlock);
    if (unlock !== null) return { ...work, unlock };
    const where = typeof known.id === "string" ? known.id : "a music work";
    problems.push(...conditionProblems(known.unlock, `music work ${where}`));
    return { ...work, unlock: { type: "unreadable" } as const };
  });
  return Object.freeze({ ...base, works, problems });
}

/** Semantic content used by compatibility tests and future catalog integrity checks. */
export function musicCatalogSemanticProjection(catalog: MusicCatalogDocument): Readonly<{
  version: 1;
  works: readonly MusicWork[];
}> {
  return Object.freeze({ version: 1 as const, works: catalog.works });
}

/** Contexts that must never be handed a non-adaptive (linear) version. */
const ADAPTIVE_REQUIRED: ReadonlySet<MusicContext> = new Set(["gameplay", "boss"]);

/** Class D is a moment/stinger asset and is never general-purpose music. */
export function isSelectableAsBed(version: MusicVersion): boolean {
  return version.available && version.class !== "D";
}

/** Choose the best available version of a work for a context: the most capable one it may use there. */
export function selectVersion(
  work: MusicWork,
  context: MusicContext,
): { versionId: string; version: MusicVersion } | null {
  const fits = (v: MusicVersion): boolean => {
    if (ADAPTIVE_REQUIRED.has(context) && v.adaptive !== true) return false;
    if (v.contexts && !v.contexts.includes(context)) return false;
    return true;
  };
  const usable = Object.entries(work.versions).filter(([, v]) => isSelectableAsBed(v) && fits(v));
  if (usable.length === 0) return null;

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
