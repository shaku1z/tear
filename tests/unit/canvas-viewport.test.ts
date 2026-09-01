import { describe, expect, it, vi } from "vitest";
import { CanvasViewport } from "../../src/presentation/canvas-viewport";

describe("CanvasViewport", () => {
  it("coalesces resize bursts and samples layout immediately before draw", () => {
    const listeners = new Map<string, EventListener>();
    const browserWindow = {
      devicePixelRatio: 2,
      addEventListener: vi.fn((kind: string, listener: EventListener) => { listeners.set(kind, listener); }),
      removeEventListener: vi.fn(),
      getComputedStyle: vi.fn(),
    } as unknown as Window;
    const browserDocument = {
      addEventListener: vi.fn(), removeEventListener: vi.fn(), getElementById: vi.fn(() => null),
    } as unknown as Document;
    const canvas = { clientWidth: 800, clientHeight: 450, width: 0, height: 0 } as HTMLCanvasElement;
    const viewport = new CanvasViewport(canvas, 1600, 900, { x: 0, y: 0 }, { l: 0, r: 0, t: 0, b: 0 },
      browserWindow, browserDocument);

    viewport.start();
    expect([canvas.width, canvas.height]).toEqual([1600, 900]);
    Object.defineProperties(canvas, { clientWidth: { value: 1024 }, clientHeight: { value: 512 } });
    listeners.get("resize")?.(new Event("resize"));
    listeners.get("resize")?.(new Event("resize"));
    expect([canvas.width, canvas.height]).toEqual([1600, 900]);

    viewport.resizeIfNeeded();
    expect([canvas.width, canvas.height]).toEqual([2048, 1024]);
  });

  it("responds directly to an observed canvas content-box change", () => {
    let observed: Element | undefined;
    let notify: ResizeObserverCallback | undefined;
    const browserWindow = {
      devicePixelRatio: 1,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      getComputedStyle: vi.fn(),
      ResizeObserver: class {
        constructor(callback: ResizeObserverCallback) { notify = callback; }
        observe(target: Element): void { observed = target; }
        disconnect(): void { observed = undefined; }
        unobserve(target: Element): void { if (observed === target) observed = undefined; }
      },
    } as unknown as Window;
    const browserDocument = {
      addEventListener: vi.fn(), removeEventListener: vi.fn(), getElementById: vi.fn(() => null),
    } as unknown as Document;
    const canvas = { clientWidth: 800, clientHeight: 450, width: 0, height: 0 } as HTMLCanvasElement;
    const viewport = new CanvasViewport(canvas, 1600, 900, { x: 0, y: 0 }, { l: 0, r: 0, t: 0, b: 0 },
      browserWindow, browserDocument);

    viewport.start();
    expect(observed).toBe(canvas);
    Object.defineProperties(canvas, { clientWidth: { value: 896 }, clientHeight: { value: 414 } });
    notify?.([], {} as ResizeObserver);
    expect([canvas.width, canvas.height]).toEqual([800, 450]);
    viewport.resizeIfNeeded();
    expect([canvas.width, canvas.height]).toEqual([896, 414]);
  });
});
