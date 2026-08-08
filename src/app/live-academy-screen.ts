import { createBrowserAcademyInspectionController, createBrowserTemporalDaggerProgramInspectionController,
  type TearAcademyInspectionController, type TearTemporalDaggerProgramInspectionController } from "../agents";
import type { AcademyScreenView } from "../presentation/screens/contracts";

/** Keeps Academy persistence composition outside the frame-sized live runtime. */
export function createLiveAcademyScreen(factory: IDBFactory | undefined): Readonly<{ snapshot: () => AcademyScreenView; refresh: () => void }> {
  let controller: TearAcademyInspectionController | undefined;
  let daggerPrograms: TearTemporalDaggerProgramInspectionController | undefined;
  const refresh = (): void => {
    if (controller) void controller.refresh(new Date().toISOString());
    if (daggerPrograms) void daggerPrograms.refresh();
  };
  void Promise.all([createBrowserAcademyInspectionController(factory), createBrowserTemporalDaggerProgramInspectionController(factory)]).then(([academy, dagger]) => {
    controller = academy;
    daggerPrograms = dagger;
    refresh();
  });
  return Object.freeze({
    snapshot: (): AcademyScreenView => {
      const inspection = controller?.snapshot() ?? { status: "loading" as const };
      const programs = daggerPrograms?.snapshot() ?? { status: "loading" as const };
      if (inspection.status === "unavailable" || programs.status === "unavailable") return {
        id: "academy", status: "unavailable", subtitle: inspection.status === "unavailable" ? inspection.reason
          : programs.status === "unavailable" ? programs.reason : "Academy storage could not be read",
        rows: [], records: [], manifests: [], daggerPrograms: [],
      };
      if (inspection.status === "loading" || programs.status === "loading") return {
        id: "academy", status: "loading", subtitle: "reading durable Academy custody", rows: [], records: [], manifests: [], daggerPrograms: [],
      };
      return {
        id: "academy", status: "ready", subtitle: "durable training custody", rows: [
          { label: "HELD", value: String(inspection.snapshot.custody.held) },
          { label: "REVIEWED", value: String(inspection.snapshot.reviewedSamples) },
          { label: "CURATED", value: String(inspection.snapshot.curation.approved) },
          { label: "TRAINING SPLIT", value: String(inspection.snapshot.splits.training ?? 0) },
          { label: "CORPUS", value: String(inspection.snapshot.corpusEntries) },
        ],
        lessons: inspection.snapshot.lessons.map((lesson) => ({
          id: lesson.id.replaceAll("-", " ").toUpperCase(), state: lesson.status.replaceAll("-", " ").toUpperCase(),
          detail: `${String(lesson.governedEntries)} governed ${lesson.governedEntries === 1 ? "entry" : "entries"} Â· ${lesson.domain.toUpperCase()}${lesson.recoveryEntries > 0 ? ` Â· ${String(lesson.recoveryEntries)} recovery` : ""}`,
        })),
        records: inspection.snapshot.records.map((record) => ({
          id: record.candidateHash.slice(0, 8).toUpperCase(),
          state: [record.custody, record.reviewed ? "reviewed" : "unreviewed", record.inCorpus ? "corpus" : "not in corpus", record.split ?? "unassigned"].join(" · "),
          detail: [record.modelTrainingConsent, record.retention === "until" ? `retains to ${record.expiresAt?.slice(0, 10) ?? "unknown"}` : "indefinite retention", record.curation ?? record.quality ?? "unassessed", record.correctionCount > 0 ? `${String(record.correctionCount)} correction${record.correctionCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
        })),
        manifests: inspection.snapshot.manifests.slice().reverse().map((manifest) => ({
          id: `${manifest.id.toUpperCase()} V${String(manifest.version)}`,
          detail: `${String(manifest.entries)} governed entr${manifest.entries === 1 ? "y" : "ies"} · root ${manifest.rootHash.slice(0, 8).toUpperCase()}`,
        })),
        daggerPrograms: programs.programs.map((program) => {
          const round = program.rounds.length;
          const checkpoint = program.checkpoint;
          const state = program.status.replaceAll("-", " ").toUpperCase();
          const detail = program.status === "review-required" ? `round ${String(round)} - awaiting an authorized review`
            : program.status === "cancelled" ? `round ${String(round)} - cancelled at epoch ${String(checkpoint?.epoch ?? 0)}; safe to resume`
              : program.status === "checkpointed" ? `round ${String(round)} - checkpoint epoch ${String(checkpoint?.epoch ?? 0)}`
                : `round ${String(round)} - fit retained; not activated or promoted`;
          return { id: program.id.replaceAll("-", " ").toUpperCase(), state, detail };
        }),
      };
    },
    refresh,
  });
}
