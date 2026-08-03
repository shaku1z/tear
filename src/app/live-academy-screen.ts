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
          { label: "CORPUS", value: String(inspection.snapshot.corpusEntries) },
        ],
        records: inspection.snapshot.records.map((record) => ({
          id: record.candidateHash.slice(0, 8).toUpperCase(),
          state: [record.custody, record.reviewed ? "reviewed" : "unreviewed", record.inCorpus ? "corpus" : "not in corpus", record.split ?? "unassigned"].join(" · "),
          detail: [record.modelTrainingConsent, record.retention === "until" ? `retains to ${record.expiresAt?.slice(0, 10) ?? "unknown"}` : "indefinite retention", record.curation ?? record.quality ?? "unassessed", record.correctionCount > 0 ? `${String(record.correctionCount)} correction${record.correctionCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
        })),
        manifests: inspection.snapshot.manifests.slice().reverse().map((manifest) => ({
          id: `${manifest.id.toUpperCase()} V${String(manifest.version)}`,
          detail: `${String(manifest.entries)} governed entr${manifest.entries === 1 ? "y" : "ies"} · root ${manifest.rootHash.slice(0, 8).toUpperCase()}`,
        })),
      };
      return { id: "academy", status: inspection.status, subtitle: inspection.status === "unavailable" ? inspection.reason : "reading durable Academy custody", rows: [], records: [], manifests: [] };
    },
    refresh,
  });
}
