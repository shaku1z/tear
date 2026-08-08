import { describe, expect, it, vi } from "vitest";

import { createLiveScreenActionBindings, type ScreenActionBindingPorts } from "../../src/app/live-screen-action-bindings";

describe("live screen action bindings", () => {
  it("routes Academy retry to the composed inspection refresh without granting a custody action", () => {
    const refreshAcademy = vi.fn();
    const dispatch = createLiveScreenActionBindings({ refreshAcademy } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "academy.retry" });
    expect(refreshAcademy).toHaveBeenCalledOnce();
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
