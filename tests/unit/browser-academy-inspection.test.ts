import { describe, expect, it } from "vitest";
import { createBrowserAcademyInspectionController, createBrowserTemporalDaggerProgramInspectionController } from "../../src/agents";

describe("C31 browser Academy composition", () => {
  it("uses the explicit unavailable inspection state when IndexedDB is absent", async () => {
    const controller = await createBrowserAcademyInspectionController(undefined);
    expect(controller.snapshot()).toEqual({ status: "unavailable", reason: "Academy storage is unavailable in this runtime" });
  });

  it("keeps the C33 program projection unavailable when browser storage is absent", async () => {
    const controller = await createBrowserTemporalDaggerProgramInspectionController(undefined);
    expect(controller.snapshot()).toEqual({ status: "unavailable", reason: "Academy storage is unavailable in this runtime" });
    await expect(controller.refresh()).resolves.toEqual(controller.snapshot());
  });
});
