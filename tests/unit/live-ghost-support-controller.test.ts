import { describe, expect, it } from "vitest";
import { LiveGhostSupportController } from "../../src/app/live-ghost-support-controller";

describe("LiveGhostSupportController", () => {
  it("fails closed without browser Vault storage and cannot synthesize a bundle", async () => {
    const controller = new LiveGhostSupportController(undefined);
    await controller.open("capsule-1");
    expect(controller.snapshot()).toMatchObject({ id: "ghostsupport", status: "unavailable", canCreate: false });
    await controller.create();
    expect(controller.snapshot().bundleHash).toBeUndefined();
  });
});
