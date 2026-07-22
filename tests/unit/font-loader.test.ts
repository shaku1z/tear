import { describe, expect, it, vi } from "vitest";
import { warmChapterFonts } from "../../src/presentation/font-loader";

describe("warmChapterFonts", () => {
  it("warms every canvas font without publishing global readiness state", async () => {
    const load = vi.fn(() => Promise.resolve([] as FontFace[]));
    const documentObject = {
      fonts: { load, ready: Promise.resolve() },
    } as unknown as Document;
    await expect(warmChapterFonts(documentObject)).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
    expect("__chapterFontsReady" in globalThis).toBe(false);
  });

  it("keeps fallback rendering available when font loading fails", async () => {
    const documentObject = {
      fonts: { load: () => Promise.reject(new Error("font unavailable")), ready: Promise.resolve() },
    } as unknown as Document;
    await expect(warmChapterFonts(documentObject)).resolves.toBe(false);
  });
});
