import { describe, expect, it, vi } from "vitest";
import { BrowserPointerLock } from "../../src/platform/browser-pointer-lock";

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}> {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

describe("browser pointer lock", () => {
  it("coalesces requests while the browser decision is pending", async () => {
    const pending = deferred();
    const requestPointerLock = vi.fn(() => pending.promise);
    const pointer = new BrowserPointerLock(
      { requestPointerLock },
      { exitPointerLock: vi.fn() },
    );

    pointer.request();
    pointer.request();
    expect(requestPointerLock).toHaveBeenCalledTimes(1);

    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    pointer.request();
    expect(requestPointerLock).toHaveBeenCalledTimes(2);
  });

  it("contains rejected and synchronous browser failures so capture can be retried", async () => {
    const rejected = Promise.reject(new DOMException("gesture required", "NotAllowedError"));
    const requestPointerLock = vi.fn()
      .mockReturnValueOnce(rejected)
      .mockImplementationOnce(() => { throw new DOMException("unsupported", "NotSupportedError"); })
      .mockReturnValueOnce(undefined);
    const pointer = new BrowserPointerLock(
      { requestPointerLock },
      { exitPointerLock: vi.fn() },
    );

    pointer.request();
    await rejected.catch(() => undefined);
    await Promise.resolve();
    pointer.request();
    pointer.request();
    expect(requestPointerLock).toHaveBeenCalledTimes(3);
  });
});
