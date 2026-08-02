import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/app/runtime-initialization", () => ({
  initializePlatformServices: (options: { readonly backfillProgress: () => void }) => { options.backfillProgress(); },
  shouldPromptForUsername: () => false,
}));

import { initializeLivePlatformBootstrap } from "../../src/app/live-platform-bootstrap";

describe("live platform bootstrap persistence adapter", () => {
  it("delegates backfill persistence through the composition-owned operation", () => {
    const backfillShopProgress = vi.fn();
    initializeLivePlatformBootstrap({ platformBootstrapPersistence: { backfillShopProgress } } as never,
      {} as never, { screen: () => "menu", prompted: () => false, active: () => false, markPrompted: vi.fn(), begin: vi.fn() });

    expect(backfillShopProgress).toHaveBeenCalledOnce();
  });
});
