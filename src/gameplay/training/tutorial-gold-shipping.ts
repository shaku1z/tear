import { loadOnce, type LazyStatus } from "../../domain/lazy-module";
import binding from "./tutorial-gold-binding.json";
import { loadTutorialGoldCorpus, type TutorialGoldCorpus } from "./tutorial-gold-reference";

/**
 * The shipped tutorial gold corpus (about 1.5 MB) is a separate on-demand asset, fetched through the
 * shared lazy loader. Nothing waits for it: a lesson starts without it, and the training host asks for
 * it once a lesson is being played. Until it has loaded (or if it cannot load), `shippingTutorialGold()`
 * reports no corpus, exactly as for an incompatible corpus, and the coach presents no demonstration;
 * the coach looks again when it arrives (`TutorialGhostCoach.select`), mid-lesson included.
 */
const corpusData = loadOnce(
  () => import("./tutorial-gold-reference-data.json").then((module): unknown => module.default),
  "The tutorial demonstrations could not load.",
);
let cached: TutorialGoldCorpus | null | undefined;

/** Synchronous view of the corpus; undefined until loaded, incompatible, or invalid. */
export function shippingTutorialGold(): TutorialGoldCorpus | undefined {
  if (corpusData.status() !== "ready") return undefined;
  if (cached === undefined) {
    // The small binding file names the corpus by content hash and ships with
    // the code; only the corpus itself is loaded on demand.
    const loaded = loadTutorialGoldCorpus(corpusData.loaded(), binding);
    cached = loaded.status === "ready" ? loaded.corpus : null;
  }
  return cached ?? undefined;
}

/** Whether the corpus has been asked for, is arriving, has arrived or failed (then the next call retries). */
export function shippingTutorialGoldStatus(): LazyStatus {
  return corpusData.status();
}

/** Fetches the corpus once. Never rejects: a failed load leaves the coach without demonstrations. */
export function loadShippingTutorialGold(): Promise<TutorialGoldCorpus | undefined> {
  return corpusData.ensure().then(shippingTutorialGold, () => undefined);
}
