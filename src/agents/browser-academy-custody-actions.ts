import { createIndexedDbGhostVaultBackend } from "../ghost";
import { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { TearAcademyCustodyActionRuntime } from "./academy-custody-actions";

/** Browser composition root for the only self-service C31 consent withdrawal. */
export async function createBrowserAcademyCustodyActionRuntime(factory: IDBFactory | undefined): Promise<TearAcademyCustodyActionRuntime | undefined> {
  if (factory === undefined) return undefined;
  return new TearAcademyCustodyActionRuntime(new TearAcademyCandidateCustodyStore(await createIndexedDbGhostVaultBackend(factory)));
}
