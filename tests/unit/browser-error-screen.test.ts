import { describe, expect, it, vi } from "vitest";
import { RuntimeFrameDriver, type AnimationFrameSource } from "../../src/app/shell/runtime-frame-driver";
import {
  createFrameFaultHandler,
  describeError,
  ERROR_SCREEN_ID,
  showErrorScreen,
  type ErrorScreenPorts,
} from "../../src/platform/browser-error-screen";
import { formatBuildLabel, type BuildIdentity } from "../../src/platform/build-identity";

/** The part of an element the error screen uses, recorded so a test reads what the player would see. */
class FakeElement {
  id = "";
  type = "";
  textContent = "";
  readonly style = { cssText: "" };
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly children: FakeElement[] = [];
  focused = false;
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }
  focus(): void {
    this.focused = true;
  }
  /** Every text the element and its descendants show, in order. */
  texts(): string[] {
    return [...(this.textContent === "" ? [] : [this.textContent]), ...this.children.flatMap((c) => c.texts())];
  }
  find(predicate: (element: FakeElement) => boolean): FakeElement | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found !== undefined) return found;
    }
    return undefined;
  }
}

function fakePage(): { readonly document: Document; readonly body: FakeElement } {
  const body = new FakeElement("body");
  const document = {
    body,
    createElement: (tag: string) => new FakeElement(tag),
    getElementById: (id: string) => body.find((element) => element.id === id) ?? null,
  } as unknown as Document;
  return { document, body };
}

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

const build: BuildIdentity = {
  version: "0.1.0",
  revision: "820e8e92aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  target: "standalone",
};

function ports(page: ReturnType<typeof fakePage>, overrides: Partial<ErrorScreenPorts> = {}): ErrorScreenPorts {
  return { document: page.document, build, reload: vi.fn(), report: vi.fn(), ...overrides };
}

describe("build label", () => {
  it("shows the version and the short revision", () => {
    expect(formatBuildLabel(build)).toBe("v0.1.0 · 820e8e9");
  });
});

describe("error screen", () => {
  it("shows what happened, RELOAD and the build, and puts focus on RELOAD", () => {
    const page = fakePage();
    showErrorScreen(ports(page), new RangeError("bad tick"));
    const screen = page.body.children[0];
    expect(screen?.id).toBe(ERROR_SCREEN_ID);
    expect(screen?.attributes.get("role")).toBe("alertdialog");
    expect(screen?.texts()).toEqual(
      expect.arrayContaining(["TEAR stopped unexpectedly", "RELOAD", "RangeError: bad tick", "v0.1.0 · 820e8e9"]),
    );
    expect(screen?.find((element) => element.tag === "button")?.focused).toBe(true);
  });

  it("reloads the page when RELOAD is pressed", () => {
    const page = fakePage();
    const reload = vi.fn();
    showErrorScreen(ports(page, { reload }), new Error("x"));
    page.body.find((element) => element.tag === "button")?.listeners.get("click")?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows one screen however many faults arrive, and keeps the first", () => {
    const page = fakePage();
    showErrorScreen(ports(page), new Error("first"));
    showErrorScreen(ports(page), new Error("second"));
    expect(page.body.children).toHaveLength(1);
    expect(page.body.texts()).toContain("Error: first");
  });

  it("shows only the first line of an error, cut to a readable length", () => {
    expect(describeError(new Error("line one\n    at stack frame"))).toBe("Error: line one");
    expect(describeError("x".repeat(500))).toHaveLength(240);
    expect(describeError("x".repeat(500)).endsWith("…")).toBe(true);
    expect(describeError(undefined)).toBe("undefined");
  });
});

describe("a frame that throws", () => {
  it("stops the loop and puts the error screen on the page, reporting the error locally", () => {
    const page = fakePage();
    const report = vi.fn();
    const source = new ManualFrames();
    const driver = new RuntimeFrameDriver(source, createFrameFaultHandler(ports(page, { report })));
    const boom = new Error("renderer lost its context");
    let frames = 0;
    driver.start(() => {
      frames += 1;
      if (frames === 2) throw boom;
    });
    source.fire(1_000);
    expect(page.body.children).toHaveLength(0);
    source.fire(1_016);
    expect(report).toHaveBeenCalledWith(boom);
    expect(page.body.children).toHaveLength(1);
    expect(page.body.texts()).toEqual(expect.arrayContaining(["RELOAD", "Error: renderer lost its context"]));
    expect(driver.running).toBe(false);
    expect(source.callbacks.size).toBe(0);
  });

  it("still reports the error when the page cannot show a screen, and never throws", () => {
    const report = vi.fn();
    const brokenDocument = {
      getElementById: () => null,
      createElement: () => {
        throw new Error("no DOM");
      },
    } as unknown as Document;
    const handler = createFrameFaultHandler({ document: brokenDocument, build, reload: vi.fn(), report });
    expect(() => {
      handler(new Error("x"));
    }).not.toThrow();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("still shows the screen when the report itself fails", () => {
    const page = fakePage();
    const handler = createFrameFaultHandler(
      ports(page, {
        report: () => {
          throw new Error("console unavailable");
        },
      }),
    );
    handler(new Error("x"));
    expect(page.body.children).toHaveLength(1);
  });
});
