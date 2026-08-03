import { createIndexedDbGhostVaultBackend } from "../ghost";
import { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { TearAcademyCandidateCurationStore } from "./academy-candidate-curation";
import { TearAcademyCandidateQualityStore } from "./academy-candidate-quality";
import { TearAcademyCandidateSplitStore } from "./academy-candidate-splits";
import { TearAcademyInspectionController } from "./academy-inspection-controller";
import { TearAcademyReviewedSampleStore } from "./academy-reviewed-sample";

/** Browser composition root for the durable C31 Academy inspection graph. */
export async function createBrowserAcademyInspectionController(factory: IDBFactory | undefined): Promise<TearAcademyInspectionController> {
  if (factory === undefined) return new TearAcademyInspectionController(undefined);
  const backend = await createIndexedDbGhostVaultBackend(factory);
  const custody = new TearAcademyCandidateCustodyStore(backend);
  const quality = new TearAcademyCandidateQualityStore(backend, custody);
  const curation = new TearAcademyCandidateCurationStore(backend, custody, quality);
  const splits = new TearAcademyCandidateSplitStore(backend, custody, quality, curation);
  const samples = new TearAcademyReviewedSampleStore(backend, custody, quality, curation, splits);
  return new TearAcademyInspectionController({ custody, quality, curation, splits, samples });
}
