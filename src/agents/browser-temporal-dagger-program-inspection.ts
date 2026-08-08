import { createIndexedDbGhostVaultBackend } from "../ghost";
import { TearTemporalDaggerProgramInspectionController } from "./temporal-dagger-program-inspection";

/** Browser composition root for the read-only C33 DAgger-program status surface. */
export async function createBrowserTemporalDaggerProgramInspectionController(factory: IDBFactory | undefined): Promise<TearTemporalDaggerProgramInspectionController> {
  if (factory === undefined) return new TearTemporalDaggerProgramInspectionController(undefined);
  return new TearTemporalDaggerProgramInspectionController(await createIndexedDbGhostVaultBackend(factory));
}
