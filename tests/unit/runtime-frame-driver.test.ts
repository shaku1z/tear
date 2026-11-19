import { describe, expect, it } from "vitest";
import { RuntimeFrameDriver, type AnimationFrameSource } from "../../src/app/shell/runtime-frame-driver";

class ManualFrames implements AnimationFrameSource {
  readonly callbacks = new Map<number, FrameRequestCallback>();
  #next = 1;
  requestAnimationFrame(callback: FrameRequestCallback): number {
    const handle = this.#next++;
    this.callbacks.set(handle, callback);
    return handle;
  }
  cancelAnimationFrame(handle: number): void {
    this.callbacks.delete(handle);
  }
  fire(timestamp: number): void {
    const entry = [...this.callbacks.entries()][0];
    if (entry === undefined) throw new Error("no frame scheduled");
    this.callbacks.delete(entry[0]);
    entry[1](timestamp);
  }
}

function unexpectedFault(error: unknown): never {
  throw error;
}

describe("runtime frame driver", () => {
  it("normalizes and bounds browser frame deltas", () => {
    const source = new ManualFrames();
    const deltas: number[] = [],
      intervals: number[] = [];
    const driver = new RuntimeFrameDriver(source, unexpectedFault, 0.1);
    driver.start((frame) => {
      deltas.push(frame.deltaSeconds);
      intervals.push(frame.intervalSeconds);
    });
    source.fire(1_000);
    source.fire(1_016);
    source.fire(2_000);
    expect(deltas).toEqual([0, 0.016, 0.1]);
    expect(intervals).toEqual([0, 0.016, 0.984]);
  });

  it("starts idempotently and cancels the scheduled frame", () => {
    const source = new ManualFrames();
    const driver = new RuntimeFrameDriver(source, unexpectedFault);
    driver.start(() => undefined);
    driver.start(() => undefined);
    expect(source.callbacks.size).toBe(1);
    driver.stop();
    expect(source.callbacks.size).toBe(0);
    expect(driver.running).toBe(false);
  });

  it("stops the loop and reports the error when a frame throws", () => {
    const source = new ManualFrames();
    const faults: unknown[] = [];
    const driver = new RuntimeFrameDriver(source, (error) => faults.push(error));
    const boom = new Error("frame exploded");
    let frames = 0;
    driver.start(() => {
      frames += 1;
      if (frames === 3) throw boom;
    });
    source.fire(1_000);
    source.fire(1_016);
    source.fire(1_032);
    expect(faults).toEqual([boom]);
    expect(driver.running).toBe(false);
    expect(source.callbacks.size).toBe(0);
    expect(frames).toBe(3);
  });

  it("can start again after a fault, with a fresh frame delta", () => {
    const source = new ManualFrames();
    const driver = new RuntimeFrameDriver(source, () => undefined);
    driver.start(() => {
      throw new Error("first run fails");
    });
    source.fire(1_000);
    const deltas: number[] = [];
    driver.start((frame) => deltas.push(frame.deltaSeconds));
    source.fire(9_000);
    expect(deltas).toEqual([0]);
  });
});
