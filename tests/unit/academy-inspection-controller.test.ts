import { describe, expect, it } from "vitest";

import { TearAcademyInspectionController } from "../../src/agents";

describe("C31 Academy inspection controller", () => {
  it("reports an explicit immutable unavailable state when the runtime has no Academy storage", async () => {
    const controller = new TearAcademyInspectionController(undefined);
    expect(controller.snapshot()).toEqual({ status: "unavailable", reason: "Academy storage is unavailable in this runtime" });
    expect(await controller.refresh("2026-08-03T00:00:00.000Z")).toEqual(controller.snapshot());
  });
});
