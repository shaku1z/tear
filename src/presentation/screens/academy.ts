import type { AcademyScreenView, ScreenRenderContext } from "./contracts";
import { backControl } from "./screen-primitives";

export function createAcademyRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    academy(view: AcademyScreenView): void {
      const { ui, canvas, width } = context;
      const panelX = width / 2 - 320;
      let y = 120;
      ui.header(canvas, "ACADEMY", view.subtitle, context.enterAmount);
      ui.panel(canvas, panelX, y, 640, Math.max(160, 56 + view.rows.length * 34));
      y += 38;
      if (view.status === "loading") ui.text(canvas, "Reading Academy custody...", width / 2, y, ui.t.type.body, "center", ui.t.alpha.muted);
      else if (view.status === "unavailable") {
        ui.text(canvas, view.subtitle, width / 2, y, ui.t.type.body, "center", ui.t.alpha.muted);
        ui.text(canvas, "Check browser storage permissions, then try again.", width / 2, y + 34, ui.t.type.caption, "center", ui.t.alpha.muted);
        context.enqueue({ x: width / 2 - 110, y: y + 62, w: 220, h: 46, label: "TRY AGAIN", action: { type: "academy.retry" } });
      }
      else {
        view.rows.forEach((row) => { ui.text(canvas, row.label, width / 2 - 288, y, ui.t.type.body, "left"); ui.displayText(canvas, row.value, width / 2 + 288, y, ui.t.type.body, "right"); y += 34; });
        const recordY = 332;
        const recordPageSize = 4;
        const recordOffset = Math.max(0, Math.min(Math.max(0, view.records.length - recordPageSize), Math.floor(context.scroll / 74)));
        const visibleRecords = view.records.slice(recordOffset, recordOffset + recordPageSize);
        const recordHeight = Math.max(84, 46 + visibleRecords.length * 74);
        ui.panel(canvas, panelX, recordY, 640, recordHeight);
        ui.sectionLabel(canvas, `DURABLE RECORDS ${String(recordOffset + 1)}-${String(recordOffset + visibleRecords.length)} / ${String(view.records.length)}`, panelX + 24, recordY + 30, 592);
        if (view.records.length === 0) ui.text(canvas, "No governed records are stored in this Academy.", panelX + 24, recordY + 64, ui.t.type.caption, "left", ui.t.alpha.muted);
        else visibleRecords.forEach((record, index) => {
          const recordTop = recordY + 52 + index * 74;
          ui.displayText(canvas, record.id, panelX + 24, recordTop, ui.t.type.label, "left");
          ui.text(canvas, record.state.toUpperCase(), panelX + 592, recordTop, ui.t.type.caption, "right", ui.t.alpha.soft);
          ui.text(canvas, record.detail, panelX + 24, recordTop + 20, ui.t.type.caption, "left", ui.t.alpha.muted);
          if (record.canWithdrawModelTraining && record.candidateHash !== undefined) context.enqueue({ x: panelX + 332, y: recordTop + 30, w: 260, h: 36, label: "WITHDRAW TRAINING CONSENT", action: { type: "academy.record.withdrawModelTraining", candidateHash: record.candidateHash } });
        });
        const manifestY = recordY + recordHeight + 20;
        const manifestPageSize = 3;
        const manifestOffset = Math.max(0, Math.min(Math.max(0, view.manifests.length - manifestPageSize), Math.floor(context.scroll / 52)));
        const visibleManifests = view.manifests.slice(manifestOffset, manifestOffset + manifestPageSize);
        ui.panel(canvas, panelX, manifestY, 640, Math.max(84, 46 + visibleManifests.length * 36));
        ui.sectionLabel(canvas, `MANIFEST REVISIONS ${String(manifestOffset + 1)}-${String(manifestOffset + visibleManifests.length)} / ${String(view.manifests.length)}`, panelX + 24, manifestY + 30, 592);
        if (view.manifests.length === 0) ui.text(canvas, "No durable manifest revisions are stored.", panelX + 24, manifestY + 64, ui.t.type.caption, "left", ui.t.alpha.muted);
        else visibleManifests.forEach((manifest, index) => {
          const manifestTop = manifestY + 52 + index * 36;
          ui.displayText(canvas, manifest.id, panelX + 24, manifestTop, ui.t.type.label, "left");
          ui.text(canvas, manifest.detail, panelX + 592, manifestTop, ui.t.type.caption, "right", ui.t.alpha.muted);
        });
        const lessonY = manifestY + Math.max(84, 46 + visibleManifests.length * 36) + 20;
        const lessons = view.lessons ?? [];
        ui.panel(canvas, panelX, lessonY, 640, Math.max(84, 46 + lessons.length * 34));
        ui.sectionLabel(canvas, "GOVERNED LESSON STATUS", panelX + 24, lessonY + 30, 592);
        lessons.forEach((lesson, index) => {
          const lessonTop = lessonY + 52 + index * 34;
          ui.displayText(canvas, lesson.id, panelX + 24, lessonTop, ui.t.type.label, "left");
          ui.text(canvas, lesson.state, panelX + 592, lessonTop, ui.t.type.caption, "right", ui.t.alpha.soft);
          ui.text(canvas, lesson.detail, panelX + 24, lessonTop + 16, ui.t.type.micro, "left", ui.t.alpha.muted);
        });
        const consentY = lessonY + Math.max(84, 46 + lessons.length * 34) + 20;
        const calibration = view.humanCalibrationConsent;
        const consentHeight = calibration === undefined ? 0 : 112;
        if (calibration !== undefined) {
          ui.panel(canvas, panelX, consentY, 640, consentHeight);
          ui.sectionLabel(canvas, "HUMAN CALIBRATION CONSENT", panelX + 24, consentY + 30, 592);
          ui.displayText(canvas, calibration.state.replaceAll("-", " ").toUpperCase(), panelX + 24, consentY + 56, ui.t.type.label, "left");
          ui.text(canvas, calibration.detail, panelX + 24, consentY + 78, ui.t.type.caption, "left", ui.t.alpha.muted);
          if (calibration.canOptIn) context.enqueue({ x: panelX + 332, y: consentY + 52, w: 260, h: 40, label: "ALLOW ANONYMOUS CALIBRATION", action: { type: "academy.humanCalibration.optIn", consent: "anonymous-improvement" } });
          if (calibration.canRevoke) context.enqueue({ x: panelX + 392, y: consentY + 52, w: 200, h: 40, label: "REVOKE CONSENT", action: { type: "academy.humanCalibration.revoke" } });
        }
        const programY = consentY + consentHeight + (calibration === undefined ? 0 : 20);
        const programs = view.daggerPrograms ?? [];
        const programPageSize = 3;
        const programOffset = Math.max(0, Math.min(Math.max(0, programs.length - programPageSize), Math.floor(context.scroll / 52)));
        const visiblePrograms = programs.slice(programOffset, programOffset + programPageSize);
        const programHeight = Math.max(84, 46 + visiblePrograms.length * 74);
        ui.panel(canvas, panelX, programY, 640, programHeight);
        ui.sectionLabel(canvas, `DAGGER PROGRAMS ${String(programOffset + 1)}-${String(programOffset + visiblePrograms.length)} / ${String(programs.length)}`, panelX + 24, programY + 30, 592);
        if (programs.length === 0) ui.text(canvas, "No DAgger programs are stored in this Academy.", panelX + 24, programY + 64, ui.t.type.caption, "left", ui.t.alpha.muted);
        else visiblePrograms.forEach((program, index) => {
          const programTop = programY + 52 + index * 74;
          ui.displayText(canvas, program.id, panelX + 24, programTop, ui.t.type.label, "left");
          ui.text(canvas, program.state, panelX + 592, programTop, ui.t.type.caption, "right", ui.t.alpha.soft);
          ui.text(canvas, program.detail, panelX + 24, programTop + 20, ui.t.type.caption, "left", ui.t.alpha.muted);
          if (program.canAdvance) context.enqueue({ x: panelX + 392, y: programTop + 28, w: 200, h: 40, label: "ADVANCE PLAN", action: { type: "academy.dagger.advance", id: program.programId ?? program.id } });
          if (program.canReview && program.correctionHash !== undefined) {
            context.enqueue({ x: panelX + 392, y: programTop + 28, w: 94, h: 40, label: "ACCEPT", action: { type: "academy.dagger.review", id: program.programId ?? program.id, correctionHash: program.correctionHash, disposition: "accepted" } });
            context.enqueue({ x: panelX + 498, y: programTop + 28, w: 94, h: 40, label: "REJECT", action: { type: "academy.dagger.review", id: program.programId ?? program.id, correctionHash: program.correctionHash, disposition: "rejected" } });
          }
        });
        const canScrollDown = recordOffset < Math.max(0, view.records.length - recordPageSize)
          || manifestOffset < Math.max(0, view.manifests.length - manifestPageSize)
          || programOffset < Math.max(0, programs.length - programPageSize);
        if (recordOffset > 0 || manifestOffset > 0 || programOffset > 0 || canScrollDown) {
          ui.scrollHint(canvas, width / 2, programY + programHeight + 16,
            recordOffset > 0 || manifestOffset > 0 || programOffset > 0, canScrollDown);
        }
      }
      backControl(context);
    },
  });
}
