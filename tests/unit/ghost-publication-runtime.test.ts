import { describe, expect, it, vi } from "vitest";
import { createStandaloneGhostPublicationRuntime } from "../../src/platform/ghost-publication-runtime";

describe("standalone Ghost publication runtime", () => {
  it("is unavailable without an explicit valid HTTPS endpoint and never loads Firebase", () => {
    const loadBearer = vi.fn();
    expect(createStandaloneGhostPublicationRuntime({ target: "standalone", endpoint: undefined, loadBearer })).toMatchObject({ available: false, reason: "endpoint-unconfigured" });
    expect(createStandaloneGhostPublicationRuntime({ target: "standalone", endpoint: "http://publication.test", loadBearer })).toMatchObject({ available: false, reason: "endpoint-invalid" });
    expect(createStandaloneGhostPublicationRuntime({ target: "standalone", endpoint: "https://publication.test/?x=1", loadBearer })).toMatchObject({ available: false, reason: "endpoint-invalid" });
    expect(loadBearer).not.toHaveBeenCalled();
  });

  it("is unavailable in CrazyGames without loading a bearer", () => {
    const loadBearer = vi.fn();
    expect(createStandaloneGhostPublicationRuntime({ target: "crazygames", endpoint: "https://publication.test", loadBearer })).toMatchObject({ available: false, reason: "unsupported-target" });
    expect(loadBearer).not.toHaveBeenCalled();
  });

  it("acquires a nonanonymous Firebase bearer only at an explicit future action", async () => {
    const acquireAuthorization = vi.fn(() => Promise.resolve(Object.freeze({ authorization: "Bearer fresh-token" })));
    const loadBearer = vi.fn(() => Promise.resolve({ acquireAuthorization }));
    const runtime = createStandaloneGhostPublicationRuntime({ target: "standalone", endpoint: "https://publication.test/", loadBearer });
    expect(runtime).toMatchObject({ available: true, endpoint: "https://publication.test" });
    expect(loadBearer).not.toHaveBeenCalled();
    await expect(runtime.acquireAuthorization?.()).resolves.toEqual({ authorization: "Bearer fresh-token" });
    expect(loadBearer).toHaveBeenCalledOnce();
    expect(acquireAuthorization).toHaveBeenCalledOnce();
  });
});
