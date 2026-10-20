import { describe, expect, it, vi } from "vitest";

import { createLiveScreenActionBindings, type ScreenActionBindingPorts } from "../../src/app/live-screen-action-bindings";

describe("live screen action bindings", () => {
  it("starts a declared Race only through its explicit setup action", () => {
    const startSelectedRun = vi.fn(), startSelectedRace = vi.fn();
    const dispatch = createLiveScreenActionBindings({ startSelectedRun, startSelectedRace } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "setup.start" }); expect(startSelectedRun).toHaveBeenCalledExactlyOnceWith(); expect(startSelectedRace).not.toHaveBeenCalled();
    dispatch({ type: "setup.start", race: true }); expect(startSelectedRace).toHaveBeenCalledExactlyOnceWith(); expect(startSelectedRun).toHaveBeenCalledOnce();
  });
  it("routes only explicit cloud catalog and selected recovery actions through eager ports", () => {
    const loadOwnGhostCapsules = vi.fn(), recoverOwnGhostCapsule = vi.fn(), closeOwnGhostCatalog = vi.fn(), resetScroll = vi.fn();
    const dispatch = createLiveScreenActionBindings({ loadOwnGhostCapsules, recoverOwnGhostCapsule, closeOwnGhostCatalog, resetScroll } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "profile.loadOwnGhostCapsules" }); dispatch({ type: "profile.recoverOwnGhostCapsule", id: "selected-original" }); dispatch({ type: "profile.closeOwnGhostCatalog" });
    expect(loadOwnGhostCapsules).toHaveBeenCalledExactlyOnceWith(); expect(recoverOwnGhostCapsule).toHaveBeenCalledExactlyOnceWith("selected-original");
    expect(closeOwnGhostCatalog).toHaveBeenCalledOnce(); expect(resetScroll).toHaveBeenCalledTimes(2);
  });
  it("dispatches normal archive picking synchronously through eager ports with exact job revision controls", () => {
    const ghostFiles = { pickArchive: vi.fn(), restoreArchive: vi.fn(), cancelArchive: vi.fn(), downloadArchive: vi.fn() };
    const dispatch = createLiveScreenActionBindings({ ghostFiles } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "profile.pickGhostArchive" }); expect(ghostFiles.pickArchive).toHaveBeenCalledExactlyOnceWith();
    dispatch({ type: "profile.reselectGhostArchive", id: "intent" }); expect(ghostFiles.pickArchive).toHaveBeenLastCalledWith("intent");
    dispatch({ type: "profile.restoreGhostArchive", id: "intent", revision: 3 }); expect(ghostFiles.restoreArchive).toHaveBeenCalledExactlyOnceWith("intent", 3);
    dispatch({ type: "profile.cancelGhostRestore", id: "intent", revision: 4 }); expect(ghostFiles.cancelArchive).toHaveBeenCalledExactlyOnceWith("intent", 4);
    dispatch({ type: "profile.cancelGhostArchiveSelection" }); expect(ghostFiles.cancelArchive).toHaveBeenLastCalledWith();
    dispatch({ type: "profile.downloadGhostArchive", id: "capsule" }); expect(ghostFiles.downloadArchive).toHaveBeenCalledExactlyOnceWith("capsule");
    dispatch({ type: "profile.downloadGhostArchive", id: "capsule", paired: true }); expect(ghostFiles.downloadArchive).toHaveBeenLastCalledWith("capsule", true);
  });
  it("routes Academy retry to the composed inspection refresh without granting a custody action", () => {
    const refreshAcademy = vi.fn();
    const dispatch = createLiveScreenActionBindings({ refreshAcademy } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "academy.retry" });
    expect(refreshAcademy).toHaveBeenCalledOnce();
  });

  it("routes Foundry refresh only to its read-only recovery projection", () => {
    const refreshFoundry = vi.fn();
    const dispatch = createLiveScreenActionBindings({ refreshFoundry } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "foundry.refresh" });
    expect(refreshFoundry).toHaveBeenCalledOnce();
  });

  it("maps canonical Training Operations actions to the preserved local ports", () => {
    const setScreen = vi.fn(), resetScroll = vi.fn(), refreshFoundry = vi.fn(), bootstrapFoundry = vi.fn(), setFoundryScheduleEnabled = vi.fn();
    const dispatch = createLiveScreenActionBindings({ setScreen, resetScroll, refreshFoundry, bootstrapFoundry, setFoundryScheduleEnabled } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "training-operations.open" });
    dispatch({ type: "training-operations.refresh" });
    dispatch({ type: "training-operations.bootstrap", profileId: "profile" });
    dispatch({ type: "training-operations.schedule.enable", scheduleHash: "a".repeat(16) });
    dispatch({ type: "training-operations.schedule.disable", scheduleHash: "b".repeat(16) });
    expect(setScreen).toHaveBeenCalledWith("foundry");
    expect(resetScroll).toHaveBeenCalledOnce();
    expect(refreshFoundry).toHaveBeenCalledTimes(2);
    expect(bootstrapFoundry).toHaveBeenCalledWith("profile");
    expect(setFoundryScheduleEnabled).toHaveBeenNthCalledWith(1, "a".repeat(16), true);
    expect(setFoundryScheduleEnabled).toHaveBeenNthCalledWith(2, "b".repeat(16), false);
  });

  it("opens only the declared safe Ghost Lab destinations", () => {
    const openGhostLab = vi.fn();
    const dispatch = createLiveScreenActionBindings({ openGhostLab } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "ghostlab.open", destination: "vault" });
    expect(openGhostLab).toHaveBeenCalledWith("vault");
    dispatch({ type: "replay.hub.open", destination: "training-operations" });
    expect(openGhostLab).toHaveBeenLastCalledWith("training-operations");
    dispatch({ type: "ghostlab.open", destination: "botevidence" });
    expect(openGhostLab).toHaveBeenLastCalledWith("botevidence");
  });

  it("maps canonical Replay Hub actions and legacy Ghost Lab actions to one port", () => {
    const openGhostLab = vi.fn(), controlGhostLabWatch = vi.fn();
    const dispatch = createLiveScreenActionBindings({ openGhostLab, controlGhostLabWatch } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "replay.hub.open", destination: "vault" });
    dispatch({ type: "ghostlab.open", destination: "vault" });
    dispatch({ type: "replay.hub.watch", command: "pause" });
    dispatch({ type: "ghostlab.watch", command: "pause" });
    expect(openGhostLab).toHaveBeenNthCalledWith(1, "vault");
    expect(openGhostLab).toHaveBeenNthCalledWith(2, "vault");
    expect(controlGhostLabWatch).toHaveBeenCalledTimes(2);
    expect(controlGhostLabWatch).toHaveBeenNthCalledWith(1, "pause");
    expect(controlGhostLabWatch).toHaveBeenNthCalledWith(2, "pause");
  });

  it("maps canonical Replay Editor actions and legacy Studio actions to one adapter", () => {
    const toggleStudio = vi.fn(), createStudioCutList = vi.fn();
    const dispatch = createLiveScreenActionBindings({ replay: { toggleStudio, createStudioCutList } } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "replay.editor.toggle" });
    dispatch({ type: "replay.studio.toggle" });
    dispatch({ type: "replay.editor.createCutList" });
    dispatch({ type: "replay.studio.createCutList" });
    expect(toggleStudio).toHaveBeenCalledTimes(2);
    expect(createStudioCutList).toHaveBeenCalledTimes(2);
  });

  it("routes only an opaque Foundry schedule toggle through the composed local controller", () => {
    const setFoundryScheduleEnabled = vi.fn(), dispatch = createLiveScreenActionBindings({ setFoundryScheduleEnabled } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "foundry.schedule.enable", scheduleHash: "a".repeat(16) });
    dispatch({ type: "foundry.schedule.disable", scheduleHash: "b".repeat(16) });
    expect(setFoundryScheduleEnabled).toHaveBeenNthCalledWith(1, "a".repeat(16), true);
    expect(setFoundryScheduleEnabled).toHaveBeenNthCalledWith(2, "b".repeat(16), false);
  });

  it("routes a Foundry bootstrap by profile identity only", () => {
    const bootstrapFoundry = vi.fn(), dispatch = createLiveScreenActionBindings({ bootstrapFoundry } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "foundry.bootstrap", profileId: "local-cycle" });
    expect(bootstrapFoundry).toHaveBeenCalledWith("local-cycle");
  });

  it("routes only an explicit persisted DAgger plan advance through the Academy port", () => {
    const advanceAcademyDagger = vi.fn();
    const dispatch = createLiveScreenActionBindings({ advanceAcademyDagger } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "academy.dagger.advance", id: "plan-42" });
    expect(advanceAcademyDagger).toHaveBeenCalledWith("plan-42");
  });

  it("routes a DAgger decision without allowing a renderer to supply an actor", () => {
    const reviewAcademyDagger = vi.fn();
    const dispatch = createLiveScreenActionBindings({ reviewAcademyDagger } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "academy.dagger.review", id: "plan-42", correctionHash: "a".repeat(16), disposition: "accepted" });
    expect(reviewAcademyDagger).toHaveBeenCalledWith("plan-42", "a".repeat(16), "accepted");
  });

  it("routes an Academy training-consent withdrawal without allowing a renderer to supply an actor", () => {
    const withdrawAcademyModelTraining = vi.fn();
    const dispatch = createLiveScreenActionBindings({ withdrawAcademyModelTraining } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "academy.record.withdrawModelTraining", candidateHash: "a".repeat(16) });
    expect(withdrawAcademyModelTraining).toHaveBeenCalledWith("a".repeat(16));
  });

  it("routes human-calibration consent decisions without allowing a renderer to supply an actor", () => {
    const optInHumanCalibration = vi.fn(), revokeHumanCalibration = vi.fn();
    const dispatch = createLiveScreenActionBindings({ optInHumanCalibration, revokeHumanCalibration } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "academy.humanCalibration.optIn", consent: "anonymous-improvement" });
    dispatch({ type: "academy.humanCalibration.revoke" });
    expect(optInHumanCalibration).toHaveBeenCalledWith("anonymous-improvement");
    expect(revokeHumanCalibration).toHaveBeenCalledOnce();
  });

  it("routes support review and creation only through explicit semantic actions", () => {
    const openGhostSupport = vi.fn(), createGhostSupport = vi.fn();
    const dispatch = createLiveScreenActionBindings({ openGhostSupport, createGhostSupport } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "profile.openGhostSupport", id: "capsule-1" });
    dispatch({ type: "ghostsupport.create" });
    expect(openGhostSupport).toHaveBeenCalledWith("capsule-1");
    expect(createGhostSupport).toHaveBeenCalledOnce();
  });
});
