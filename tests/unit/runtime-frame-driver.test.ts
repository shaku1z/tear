import { describe, expect, it } from "vitest";
import { RuntimeFrameDriver, type AnimationFrameSource } from "../../src/app/runtime-frame-driver";

class ManualFrames implements AnimationFrameSource {
  readonly callbacks = new Map<number, FrameRequestCallback>();
  #next = 1;
  requestAnimationFrame(callback: FrameRequestCallback): number {
    const handle = this.#next++;
    this.callbacks.set(handle, callback);
    return handle;
  }
  cancelAnimationFrame(handle: number): void { this.callbacks.delete(handle); }
  fire(timestamp: number): void {
    const entry = [...this.callbacks.entries()][0];
    if (entry === undefined) throw new Error("no frame scheduled");
    this.callbacks.delete(entry[0]);
    entry[1](timestamp);
  }
}

describe("runtime frame driver", () => {
  it("normalizes and bounds browser frame deltas", () => {
    const source = new ManualFrames();
    const deltas: number[] = [];
    const driver = new RuntimeFrameDriver(source, 0.1);
    driver.start((frame) => { deltas.push(frame.deltaSeconds); });
    source.fire(1_000);
    source.fire(1_016);
    source.fire(2_000);
    expect(deltas).toEqual([0, 0.016, 0.1]);
  });

  it("starts idempotently and cancels the scheduled frame", () => {
    const source = new ManualFrames();
    const driver = new RuntimeFrameDriver(source);
    driver.start(() => undefined);
    driver.start(() => undefined);
    expect(source.callbacks.size).toBe(1);
    driver.stop();
    expect(source.callbacks.size).toBe(0);
    expect(driver.running).toBe(false);
  });
});
