import { createIndexedDbGhostVaultBackend } from "../ghost";
import { TearTemporalDaggerProgramPlanVault, TearTemporalDaggerProgramRuntime } from "./temporal-dagger-program-runtime";

export interface BrowserTemporalDaggerProgramRuntimeComposition {
  readonly runtime: TearTemporalDaggerProgramRuntime;
  readonly plans: TearTemporalDaggerProgramPlanVault;
}

/** Browser-only C33 composition. It does nothing until a semantic Academy command explicitly advances a persisted plan. */
export async function createBrowserTemporalDaggerProgramRuntime(factory: IDBFactory | undefined): Promise<BrowserTemporalDaggerProgramRuntimeComposition | undefined> {
  if (factory === undefined) return undefined;
  const backend = await createIndexedDbGhostVaultBackend(factory), plans = new TearTemporalDaggerProgramPlanVault(backend);
  return Object.freeze({ plans, runtime: new TearTemporalDaggerProgramRuntime(backend, plans) });
}
