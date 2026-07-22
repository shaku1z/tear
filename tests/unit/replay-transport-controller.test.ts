import { describe, expect, it, vi } from "vitest";
import { handleReplayTransport } from "../../src/app/replay-transport-controller";

describe("replay transport controller", () => {
  it("handles scrub, pause, and keyboard seeks", () => {
    const seek = vi.fn(), toggle = vi.fn();
    handleReplayTransport({ controls: { clicked: true, clickX: 60, clickY: 20,
      pressed: new Set(["Space", "ArrowLeft", "ArrowRight"]), takeClick: () => ({ x: 60, y: 20 }) },
    currentTime: 10, duration: 20, scrub: { x: 10, y: 20, width: 100 }, seek, toggle });
    expect(seek).toHaveBeenNthCalledWith(1, 10);
    expect(seek).toHaveBeenNthCalledWith(2, 5);
    expect(seek).toHaveBeenNthCalledWith(3, 15);
    expect(toggle).toHaveBeenCalledOnce();
  });
});
