import { installPrimaryMusicBackend } from "./music-backend-registry";
import { BiomeStemBackend, type LoadedCueRef } from "./stems/biome-stem-backend";
import { StemCueMusicBackend } from "./stems/stem-cue-backend";
import type { StemCueManifest } from "./stems/types";
import type { SignalCatalog } from "./signal/catalog";
import { FALLBACK_MUSIC_ROUTING, loadMusicRouting } from "./signal/music-routing-loader";
import { requestedFoundryPreview } from "./foundry-preview";

/** Stage name (music `biomeId`) → recorded cue id. */
/** Boss id → its own cue, overriding the biome track during that fight. */
const DEFAULT_CUE_ID = FALLBACK_MUSIC_ROUTING.defaultWorkId;
/** Routed cues are guaranteed; the catalog adds every other playable work. */
const ROUTED_CUE_IDS = [
  DEFAULT_CUE_ID,
  ...FALLBACK_MUSIC_ROUTING.rules.flatMap((rule) =>
    rule.selection.type === "primary"
      ? [rule.selection.workId]
      : rule.selection.entries.map((entry) => entry.workId),
  ),
];

/**
 * Cue *manifests* are small JSON; audio stays lazy (decoded in `#activate`), so
 * loading every catalog work costs almost nothing and is what makes station-only
 * works actually playable. Without this, `pickNext` can return a work the backend
 * has never heard of and routing silently falls back to canonical (audit D2).
 */
function playableCueIds(catalog: SignalCatalog | null): readonly string[] {
  if (!catalog) return ROUTED_CUE_IDS;
  const fromCatalog = catalog.works
    .filter((work) => work.versions["adaptive-game"]?.available === true)
    .map((work) => work.id);
  return [...new Set([...ROUTED_CUE_IDS, ...fromCatalog])];
}

async function fetchCue(cueId: string): Promise<LoadedCueRef> {
  const baseUrl = `audio/cues/${cueId}`;
  const url = new URL(`${baseUrl}/cue.json`, document.baseURI).href;
  const manifest = (await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`cue ${cueId} not found (${String(response.status)})`);
    return response.json();
  })) as LoadedCueRef["manifest"];
  return { id: cueId, manifest, baseUrl };
}

/**
 * How this session wants music. Recorded biome stems are the DEFAULT; opt out
 * with `?stems=off` (procedural engine) or audition one cue with `?stemcue=<id>`.
 */
export function requestedStemsMode(): { mode: "biome" } | { mode: "single"; cueId: string } | { mode: "off" } {
  try {
    const params = new URLSearchParams(window.location.search);
    const single = params.get("stemcue");
    if (single) return { mode: "single", cueId: single };
    if (params.get("stems") === "off") return { mode: "off" };
    return { mode: "biome" };
  } catch {
    return { mode: "biome" };
  }
}

/** Installs the biome-routed recorded-cue engine as the primary music backend. */
export async function installBiomeStemBackend(): Promise<boolean> {
  try {
    // THE SIGNAL catalog is optional: without it, routing stays canonical.
    const catalog = await fetch(new URL("audio/catalog.json", document.baseURI).href)
      .then((r) => (r.ok ? (r.json() as Promise<SignalCatalog>) : null))
      .catch(() => null);
    const routing = await loadMusicRouting();
    const settled = await Promise.allSettled(playableCueIds(catalog).map(fetchCue));
    const cues = settled
      .filter((r): r is PromiseFulfilledResult<LoadedCueRef> => r.status === "fulfilled")
      .map((r) => r.value);
    if (!cues.some((c) => c.id === routing.defaultWorkId)) throw new Error("default cue failed to load");
    installPrimaryMusicBackend(() => new BiomeStemBackend(cues, routing, catalog));
    return true;
  } catch (error) {
    console.warn("Biome stem engine unavailable; falling back", error);
    return false;
  }
}

/** Installs a single recorded cue (for `?stemcue=<id>` auditioning). */
export async function installStemCueMusicBackend(cueId: string): Promise<boolean> {
  try {
    const base = `audio/cues/${cueId}`;
    const url = new URL(`${base}/cue.json`, document.baseURI).href;
    const cue = (await fetch(url).then((response) => {
      if (!response.ok) throw new Error(`cue ${cueId} not found (${String(response.status)})`);
      return response.json();
    })) as StemCueManifest;
    const preview = requestedFoundryPreview();
    installPrimaryMusicBackend(
      () => new StemCueMusicBackend(cue, base, preview),
    );
    return true;
  } catch (error) {
    console.warn(`Stem cue "${cueId}" unavailable; falling back`, error);
    return false;
  }
}
