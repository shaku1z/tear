import { describe, expect, it, vi } from "vitest";
import { createBrowserReplayFiles } from "../../src/app/replay/browser-replay-files";

class Element extends EventTarget {
  type = "";
  accept = "";
  hidden = false;
  value = "same-file";
  href = "";
  download = "";
  removed = false;
  files: readonly unknown[] = [];
  click = vi.fn();
  setAttribute(): void {
    /* DOM contract stub */
  }
  remove(): void {
    this.removed = true;
  }
}
function fixture(active = true) {
  const elements: Element[] = [],
    revoked = vi.fn(),
    callbacks: (() => void)[] = [],
    blobs: Blob[] = [];
  const document = {
    createElement: vi.fn(() => {
      const element = new Element();
      elements.push(element);
      return element;
    }),
    body: { append: vi.fn() },
  };
  const port = createBrowserReplayFiles({
    document: document as unknown as Document,
    activation: () => active,
    createUrl: (blob) => {
      blobs.push(blob);
      return "blob:owned-test";
    },
    revokeUrl: revoked,
    defer: (callback) => {
      callbacks.push(callback);
    },
  });
  return { port, document, elements, revoked, callbacks, blobs };
}
describe("the replay file picker and download", () => {
  it("opens the picker synchronously, passes only the selected File, clears its value and removes listeners", () => {
    const f = fixture(),
      selected = vi.fn(),
      cancelled = vi.fn(),
      file = { size: 3, arrayBuffer: vi.fn() };
    const dispose = f.port.pick(selected, cancelled),
      input = f.elements[0];
    expect(input?.click).toHaveBeenCalledOnce();
    expect(input?.hidden).toBe(true);
    expect(input?.accept).toBe(".json,application/json");
    if (!input) throw new Error("missing input");
    input.files = [file];
    input.dispatchEvent(new Event("change"));
    expect(selected).toHaveBeenCalledExactlyOnceWith(file);
    expect(cancelled).not.toHaveBeenCalled();
    expect(input.value).toBe("");
    expect(input.removed).toBe(true);
    input.dispatchEvent(new Event("change"));
    dispose();
    expect(selected).toHaveBeenCalledOnce();
    f.port.pick(selected, cancelled);
    expect(f.elements[1]?.click).toHaveBeenCalledOnce();
  });
  it("handles native cancellation and disposal without a stale change or byte read", () => {
    const f = fixture(),
      selected = vi.fn(),
      cancelled = vi.fn();
    f.port.pick(selected, cancelled);
    f.elements[0]?.dispatchEvent(new Event("cancel"));
    expect(cancelled).toHaveBeenCalledOnce();
    expect(selected).not.toHaveBeenCalled();
    const dispose = f.port.pick(selected, cancelled);
    dispose();
    f.elements[1]?.dispatchEvent(new Event("change"));
    expect(selected).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("reports expired activation before creating a picker", () => {
    const f = fixture(false);
    expect(() => f.port.pick(vi.fn(), vi.fn())).toThrow(/IMPORT A REPLAY FILE/u);
    expect(f.document.createElement).not.toHaveBeenCalled();
  });
  it("requests an exact-byte Blob download with safe filename and cleans the anchor and URL", async () => {
    const f = fixture(),
      bytes = new Uint8Array([1, 2, 3]);
    f.port.download(bytes, "../../unsafe file.json");
    bytes.fill(9);
    const blob = f.blobs[0];
    if (!blob) throw new Error("missing download Blob");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const anchor = f.elements[0];
    expect(anchor?.download).toBe(".._.._unsafe_file.json");
    expect(anchor?.click).toHaveBeenCalledOnce();
    expect(anchor?.removed).toBe(true);
    expect(f.revoked).not.toHaveBeenCalled();
    f.callbacks[0]?.();
    expect(f.revoked).toHaveBeenCalledExactlyOnceWith("blob:owned-test");
  });
  it("cleans failed download clicks without claiming a saved file", () => {
    const f = fixture();
    f.document.createElement.mockImplementationOnce(() => {
      const element = new Element();
      element.click.mockImplementation(() => {
        throw new Error("blocked");
      });
      f.elements.push(element);
      return element;
    });
    expect(() => {
      f.port.download(new Uint8Array([1]), "owned.json");
    }).toThrow("blocked");
    expect(f.elements[0]?.removed).toBe(true);
    f.callbacks[0]?.();
    expect(f.revoked).toHaveBeenCalledOnce();
  });
});
