import binding from "./tutorial-gold-binding.json";
import { loadTutorialGoldCorpus, type TutorialGoldCorpus } from "./tutorial-gold-reference";

/**
 * The shipped tutorial gold corpus (about 1.5 MB) is a separate on-demand
 * asset. Training preflight awaits `loadShippingTutorialGold()` before a
 * tutorial or practice run starts; until it has loaded (or if it cannot load),
 * `shippingTutorialGold()` reports no corpus, exactly as for an incompatible
 * corpus, and the coach presents no demonstration.
 */
let source: unknown;
let cached: TutorialGoldCorpus | null | undefined;
let loading: Promise<TutorialGoldCorpus | undefined> | undefined;

/** Synchronous view of the corpus; undefined until loaded, incompatible, or invalid. */
export function shippingTutorialGold(): TutorialGoldCorpus | undefined {
  if (source === undefined) return undefined;
  if (cached === undefined) {
    // The small binding file names the corpus by content hash and ships with
    // the code; only the corpus itself is loaded on demand.
    const loaded = loadTutorialGoldCorpus(source, binding);
    cached = loaded.status === "ready" ? loaded.corpus : null;
  }
  return cached ?? undefined;
}

/** Fetches the corpus once. Never rejects: a failed load leaves the coach without demonstrations. */
export function loadShippingTutorialGold(): Promise<TutorialGoldCorpus | undefined> {
  loading ??= import("./tutorial-gold-reference-data.json").then(
    (module) => {
      source = module.default;
      return shippingTutorialGold();
    },
    () => {
      loading = undefined;
      return undefined;
    },
  );
  return loading;
}
