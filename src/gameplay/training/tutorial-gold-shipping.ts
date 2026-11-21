import { loadOnce, type LazyStatus } from "../../domain/lazy-module";
import type { TutorialGoldCorpus } from "./tutorial-gold-reference";

/**
 * The shipped tutorial gold corpus (about 1.5 MB) is a separate on-demand asset, fetched through the
 * shared lazy loader. Nothing waits for it: a lesson starts without it, and the training host asks for
 * it once a lesson is being played. Until it has loaded (or if it cannot load), `shippingTutorialGold()`
 * reports no corpus, exactly as for an incompatible corpus, and the coach presents no demonstration;
 * the coach looks again when it arrives (`TutorialGhostCoach.select`), mid-lesson included.
 */
const shipped = loadOnce(
  () => import("./tutorial-gold-corpus").then((module) => module.SHIPPED_TUTORIAL_GOLD),
  "The tutorial demonstrations could not load.",
);

/** Synchronous view of the corpus; undefined until loaded, incompatible, or invalid. */
export function shippingTutorialGold(): TutorialGoldCorpus | undefined {
  return shipped.status() === "ready" ? (shipped.loaded() ?? undefined) : undefined;
}

/** Whether the corpus has been asked for, is arriving, has arrived or failed (then the next call retries). */
export function shippingTutorialGoldStatus(): LazyStatus {
  return shipped.status();
}

/** Fetches the corpus once. Never rejects: a failed load leaves the coach without demonstrations. */
export function loadShippingTutorialGold(): Promise<TutorialGoldCorpus | undefined> {
  return shipped.ensure().then(shippingTutorialGold, () => undefined);
}
