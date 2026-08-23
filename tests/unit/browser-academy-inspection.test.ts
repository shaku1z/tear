import { describe, expect, it } from "vitest";
import { createBrowserAcademyCustodyActionRuntime, createBrowserAcademyInspectionController, createBrowserTemporalDaggerProgramInspectionController } from "../../src/agents";

describe("C31 browser Academy composition", () => {
  it("uses the explicit unavailable inspection state when IndexedDB is absent", async () => {
    const controller = await createBrowserAcademyInspectionController(undefined);
    expect(controller.snapshot()).toEqual({ status: "unavailable", reason: "Training Archive storage is unavailable in this runtime" });
  });

  it("keeps the C33 program projection unavailable when browser storage is absent", async () => {
    const controller = await createBrowserTemporalDaggerProgramInspectionController(undefined);
    expect(controller.snapshot()).toEqual({ status: "unavailable", reason: "Training Archive storage is unavailable in this runtime" });
    await expect(controller.refresh()).resolves.toEqual(controller.snapshot());
  });

  it("does not construct a C31 consent-mutation runtime when IndexedDB is absent", async () => {
    await expect(createBrowserAcademyCustodyActionRuntime(undefined)).resolves.toBeUndefined();
  });
});
