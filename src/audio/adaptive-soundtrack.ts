import {
  createPinnedModuleTearScoreClient,
  preparePinnedTearScoreClient,
  type TearScoreModuleApi,
} from "./tear-score-module";
import {
  TearScoreMusicBackend,
  type TearScoreClient,
} from "./tear-score-adapter";

/**
 * Canonical future asset locations. The loader preloads the paired host and
 * the canonical module imports that same URL relatively; keeping the pair
 * explicit avoids placeholder vendor files today.
 */
export const ADAPTIVE_SOUNDTRACK_MODULE_PATH =
  "vendor/tear-music/adaptive-soundtrack.esm.js";
export const ADAPTIVE_SOUNDTRACK_TONE_HOST_PATH =
  "vendor/tear-music/tone-host-14.9.17.esm.js";

/** Existing pinned assets remain the read-only compatibility fallback. */
export const TEAR_SCORE_FALLBACK_MODULE_PATH =
  "vendor/tear-score/tear-score.esm.js";
export const TEAR_SCORE_FALLBACK_TONE_HOST_PATH =
  "vendor/tear-score/tone-host-14.9.17.esm.js";

/** Canonical game-facing name for the existing audio client contract. */
export type AdaptiveSoundtrackClient = TearScoreClient;

/**
 * Canonical game-facing backend facade. It deliberately retains the legacy
 * backend identifier and replay metadata contract until their signed removal
 * gate is reached.
 */
export class AdaptiveSoundtrackMusicBackend extends TearScoreMusicBackend {}

export type AdaptiveSoundtrackModuleLoader = () => Promise<unknown>;
export type AdaptiveSoundtrackClientLoader = () => Promise<AdaptiveSoundtrackClient>;

export interface AdaptiveSoundtrackLoaderOptions {
  /** Test/host injection; production uses the canonical same-origin loader. */
  readonly canonicalLoader?: AdaptiveSoundtrackModuleLoader;
  /** Test/host injection; production delegates to the pinned TearScore loader. */
  readonly fallbackLoader?: AdaptiveSoundtrackClientLoader;
  /** Set false for isolated calls; the default production path is memoized. */
  readonly cache?: boolean;
}

interface AdaptiveSoundtrackModule {
  readonly api: TearScoreModuleApi;
  readonly createApi: () => TearScoreModuleApi;
}

function isModuleApi(value: unknown): value is TearScoreModuleApi {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.initialize === "function"
    && typeof record.start === "function"
    && typeof record.updateContext === "function"
    && typeof record.setMuteReason === "function"
    && typeof record.dispose === "function";
}

function readModule(value: unknown): AdaptiveSoundtrackModule | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const api = record.api;
  const constructor = record.AdaptiveSoundtrackAPI ?? record.TearScoreAPI;
  if (!isModuleApi(api) || typeof constructor !== "function") return null;
  return {
    api,
    createApi: () => new (constructor as new () => TearScoreModuleApi)(),
  };
}

const loadCanonicalModule: AdaptiveSoundtrackModuleLoader = async () => {
  if (typeof document === "undefined") {
    throw new Error("Adaptive Soundtrack ESM requires a browser document");
  }
  // Preload the paired host explicitly so a partial canonical deployment
  // cannot initialize an engine against a missing Tone surface. The canonical
  // module also imports this same URL relatively; the browser module cache
  // prevents a second evaluation.
  const toneHost = new URL(ADAPTIVE_SOUNDTRACK_TONE_HOST_PATH, document.baseURI).href;
  await import(/* @vite-ignore */ toneHost);
  const source = new URL(ADAPTIVE_SOUNDTRACK_MODULE_PATH, document.baseURI).href;
  return import(/* @vite-ignore */ source);
};

async function loadAdaptiveSoundtrackClient(
  canonicalLoader: AdaptiveSoundtrackModuleLoader,
  fallbackLoader: AdaptiveSoundtrackClientLoader,
): Promise<AdaptiveSoundtrackClient> {
  let canonicalError: unknown;
  try {
    const module = readModule(await canonicalLoader());
    if (module === null) {
      throw new Error("Adaptive Soundtrack ESM did not expose its adapter API");
    }
    return createPinnedModuleTearScoreClient(module.api, module.createApi);
  } catch (error: unknown) {
    canonicalError = error;
  }

  try {
    return await fallbackLoader();
  } catch (fallbackError: unknown) {
    throw new AggregateError(
      [canonicalError, fallbackError],
      "Adaptive Soundtrack and TearScore fallback were unavailable",
      { cause: fallbackError },
    );
  }
}

let preparation: Promise<AdaptiveSoundtrackClient> | null = null;

/**
 * Prepares the canonical Adaptive Soundtrack client with a safe legacy read.
 *
 * The canonical vendor path is attempted first. A missing/unloadable future
 * artifact is intentionally non-fatal: the current byte-pinned TearScore
 * artifact is loaded by its existing preparation path. The default promise is
 * shared so concurrent bootstrap callers cannot initialize two clients.
 */
export function preparePinnedAdaptiveSoundtrackClient(
  options: AdaptiveSoundtrackLoaderOptions = {},
): Promise<AdaptiveSoundtrackClient> {
  const hasCustomLoader = options.canonicalLoader !== undefined
    || options.fallbackLoader !== undefined;
  const useCache = options.cache ?? !hasCustomLoader;
  if (useCache && preparation !== null) return preparation;

  const canonicalLoader = options.canonicalLoader ?? loadCanonicalModule;
  const fallbackLoader = options.fallbackLoader ?? (() => preparePinnedTearScoreClient());
  const request = loadAdaptiveSoundtrackClient(canonicalLoader, fallbackLoader);
  if (!useCache) return request;

  preparation = request.catch((error: unknown) => {
    preparation = null;
    throw error;
  });
  return preparation;
}
