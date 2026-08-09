import { describe, expect, it, vi } from "vitest";

import { createLiveScreenActionBindings, type ScreenActionBindingPorts } from "../../src/app/live-screen-action-bindings";

describe("live screen action bindings", () => {
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
});
