import { createBrowserAcademyInspectionController, createBrowserAcademyCustodyActionRuntime, createBrowserTemporalDaggerProgramInspectionController, createBrowserTemporalDaggerProgramRuntime,
  type TearAcademyInspectionController, type TearTemporalDaggerProgramInspectionController } from "../agents";
import type { AcademyScreenView } from "../presentation/screens/contracts";

/** Keeps Academy persistence composition outside the frame-sized live runtime. */
export function createLiveAcademyScreen(factory: IDBFactory | undefined, currentSignedInActor: () => string | undefined = () => undefined): Readonly<{ snapshot: () => AcademyScreenView; refresh: () => void; advance: (id: string) => void; review: (id: string, correctionHash: string, disposition: "accepted" | "rejected") => void; withdrawModelTraining: (candidateHash: string) => void }> {
  let controller: TearAcademyInspectionController | undefined;
  let daggerPrograms: TearTemporalDaggerProgramInspectionController | undefined;
  let daggerRuntime: Awaited<ReturnType<typeof createBrowserTemporalDaggerProgramRuntime>>;
  let custodyActions: Awaited<ReturnType<typeof createBrowserAcademyCustodyActionRuntime>>;
  const refresh = (): void => {
    if (controller) void controller.refresh(new Date().toISOString(), currentSignedInActor());
    if (daggerPrograms) void daggerPrograms.refresh();
  };
  const advance = (id: string): void => { if (daggerRuntime !== undefined) void daggerRuntime.runtime.advance(id).then(() => { refresh(); }); };
  const review = (id: string, correctionHash: string, disposition: "accepted" | "rejected"): void => {
    const reviewer = currentSignedInActor();
    if (daggerRuntime !== undefined && reviewer !== undefined) void daggerRuntime.runtime.review(id, correctionHash, disposition, reviewer, new Date().toISOString(),
      `Authorized signed-in Academy reviewer ${disposition} this immutable DAgger correction.`).then(() => { refresh(); }).catch(() => { refresh(); });
  };
  const withdrawModelTraining = (candidateHash: string): void => {
    const actor = currentSignedInActor();
    if (custodyActions !== undefined && actor !== undefined) void custodyActions.withdrawModelTraining(candidateHash, actor, new Date().toISOString()).then(() => { refresh(); }).catch(() => { refresh(); });
  };
  void Promise.all([createBrowserAcademyInspectionController(factory), createBrowserAcademyCustodyActionRuntime(factory), createBrowserTemporalDaggerProgramInspectionController(factory), createBrowserTemporalDaggerProgramRuntime(factory)]).then(([academy, actions, dagger, runtime]) => {
    controller = academy;
    custodyActions = actions;
    daggerPrograms = dagger;
    daggerRuntime = runtime;
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
          candidateHash: record.candidateHash, canWithdrawModelTraining: record.canWithdrawModelTraining,
        })),
        manifests: inspection.snapshot.manifests.slice().reverse().map((manifest) => ({
          id: `${manifest.id.toUpperCase()} V${String(manifest.version)}`,
          detail: `${String(manifest.entries)} governed entr${manifest.entries === 1 ? "y" : "ies"} · root ${manifest.rootHash.slice(0, 8).toUpperCase()}`,
        })),
        daggerPrograms: [
          ...programs.plannedProgramIds.filter((id) => !programs.programs.some((program) => program.id === id)).map((id) => ({
            id: id.replaceAll("-", " ").toUpperCase(), programId: id, state: "READY", detail: "persisted plan - ready to start its declared first round", canAdvance: true,
          })),
          ...programs.programs.flatMap((program) => {
          const round = program.rounds.length;
          const checkpoint = program.checkpoint;
          const state = program.status.replaceAll("-", " ").toUpperCase();
          const detail = program.status === "review-required" ? `round ${String(round)} - awaiting an authorized review`
            : program.status === "cancelled" ? `round ${String(round)} - cancelled at epoch ${String(checkpoint?.epoch ?? 0)}; safe to resume`
              : program.status === "checkpointed" ? `round ${String(round)} - checkpoint epoch ${String(checkpoint?.epoch ?? 0)}`
                : `round ${String(round)} - fit retained; not activated or promoted`;
          const parent = { id: program.id.replaceAll("-", " ").toUpperCase(), programId: program.id, state, detail,
            canAdvance: programs.plannedProgramIds.includes(program.id) && program.status !== "review-required" };
          if (program.status !== "review-required") return [parent];
          const plan = programs.plans.find((entry) => entry.id === program.id);
          const reviewer = currentSignedInActor();
          const canReview = reviewer !== undefined && plan?.authorizedReviewers.includes(reviewer) === true;
          const decisions = programs.reviews.find((entry) => entry.programId === program.id)?.reviews ?? [];
          return [parent, ...program.capture.corrections.map((correction) => {
            const decision = decisions.find((entry) => entry.correctionHash === correction.correctionHash);
            const actionNames = (actions: readonly { readonly type: string }[]) => actions.map((action) => action.type).join(", ") || "no action";
            return {
              id: `CORRECTION ${correction.correctionHash.slice(0, 8).toUpperCase()}`, programId: program.id,
              correctionHash: correction.correctionHash, state: decision?.disposition?.toUpperCase() ?? (canReview ? "AWAITING DECISION" : reviewer === undefined ? "SIGN-IN REQUIRED" : "NOT AUTHORIZED"),
              detail: `tick ${String(correction.tick)} - challenger: ${actionNames(correction.challengerActions)} - teacher: ${actionNames(correction.teacherActions)}`,
              canReview: decision === undefined && canReview,
            };
          })];
          }),
        ],
      };
    },
    refresh, advance, review, withdrawModelTraining,
  });
}
