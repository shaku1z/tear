import binding from "./tutorial-gold-binding.json";
import data from "./tutorial-gold-reference-data.json";
import { loadTutorialGoldCorpus, type TutorialGoldCorpus } from "./tutorial-gold-reference";

/**
 * The shipped tutorial gold corpus (about 1.5 MB) checked against its binding, which names the corpus by
 * content hash and ships with the code. This module is fetched on demand (`tutorial-gold-shipping.ts`), so the
 * corpus reader loads with the corpus and not with the game; null when the corpus is incompatible or invalid.
 */
function checkedCorpus(): TutorialGoldCorpus | null {
  const loaded = loadTutorialGoldCorpus(data, binding);
  return loaded.status === "ready" ? loaded.corpus : null;
}

export const SHIPPED_TUTORIAL_GOLD: TutorialGoldCorpus | null = checkedCorpus();
