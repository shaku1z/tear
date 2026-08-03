import { createBrowserAcademyInspectionController, type TearAcademyInspectionController } from "../agents";
import type { AcademyScreenView } from "../presentation/screens/contracts";

/** Keeps Academy persistence composition outside the frame-sized live runtime. */
export function createLiveAcademyScreen(factory: IDBFactory | undefined): Readonly<{ snapshot: () => AcademyScreenView; refresh: () => void }> {
  let controller: TearAcademyInspectionController | undefined;
  const refresh = (): void => { if (controller) void controller.refresh(new Date().toISOString()); };
  void createBrowserAcademyInspectionController(factory).then((value) => {
    controller = value;
    refresh();
  });
  return Object.freeze({
    snapshot: (): AcademyScreenView => {
      const inspection = controller?.snapshot() ?? { status: "loading" as const };
      if (inspection.status === "ready") return {
        id: "academy", status: "ready", subtitle: "durable training custody", rows: [
          { label: "HELD", value: String(inspection.snapshot.custody.held) },
          { label: "REVIEWED", value: String(inspection.snapshot.reviewedSamples) },
          { label: "CURATED", value: String(inspection.snapshot.curation.approved) },
          { label: "TRAINING SPLIT", value: String(inspection.snapshot.splits.training ?? 0) },
        ],
      };
      return { id: "academy", status: inspection.status, subtitle: inspection.status === "unavailable" ? inspection.reason : "reading durable Academy custody", rows: [] };
    },
    refresh,
  });
}
