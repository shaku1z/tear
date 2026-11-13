import { describe, expect, it } from "vitest";

import { TextLayoutCache } from "../../src/presentation/ui-text";
import { fitTextLayout, wrapSpaceSeparated } from "../../src/presentation/ui-text-fit";
import type { UiRuntime } from "../../src/presentation/ui-contracts";

/** Monospace canvas stand-in that records font assignments and measurements. */
function fakeCanvas() {
  const log = { fonts: [] as string[], measured: 0 };
  let font = "initial";
  const ctx = {
    get font() {
      return font;
    },
    set font(value: string) {
      log.fonts.push(value);
      font = value;
    },
    measureText(text: string) {
      log.measured += 1;
      return { width: text.length * Number(/(\d+)px/u.exec(font)?.[1] ?? 0) * 0.6 };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

function fakeUi(brand: string): UiRuntime {
  return {
    t: { font: { brand } },
    font: (size: number, bold?: boolean) => `${bold ? "bold " : ""}${String(size)}px ${brand}`,
  } as unknown as UiRuntime;
}

describe("text layout cache", () => {
  it("returns the uncached layout and leaves the context font where measuring would", () => {
    const options = { size: 20, floor: 13, maxLines: 2 };
    const reference = fakeCanvas();
    const ui = fakeUi("Mono");
    const expected = fitTextLayout(
      (value, size) => {
        reference.ctx.font = ui.font(size, true);
        return reference.ctx.measureText(value).width;
      },
      "TRAINING OPERATIONS CENTRE",
      140,
      options,
    );
    const cache = new TextLayoutCache();
    const live = fakeCanvas();
    const first = cache.fit(ui, live.ctx, "TRAINING OPERATIONS CENTRE", 140, options, true);
    const measuredOnce = live.log.measured;
    live.ctx.font = "changed by a later draw";
    const second = cache.fit(ui, live.ctx, "TRAINING OPERATIONS CENTRE", 140, options, true);
    expect(first).toEqual(expected);
    expect(second).toBe(first);
    expect(live.log.measured).toBe(measuredOnce);
    expect(live.ctx.font).toBe(reference.ctx.font);
  });

  it("keys on font family, weight, width, options and text, and forgets on clear", () => {
    const cache = new TextLayoutCache();
    const { ctx, log } = fakeCanvas();
    const base = { size: 16 };
    cache.fit(fakeUi("Mono"), ctx, "SHOP", 200, base, false);
    const after = () => log.measured;
    const start = after();
    cache.fit(fakeUi("Other"), ctx, "SHOP", 200, base, false);
    cache.fit(fakeUi("Mono"), ctx, "SHOP", 200, base, true);
    cache.fit(fakeUi("Mono"), ctx, "SHOP", 199, base, false);
    cache.fit(fakeUi("Mono"), ctx, "SHOP", 200, { size: 15 }, false);
    cache.fit(fakeUi("Mono"), ctx, "SHOPS", 200, base, false);
    expect(after() - start).toBe(5);
    cache.fit(fakeUi("Mono"), ctx, "SHOP", 200, base, false);
    expect(after() - start).toBe(5);
    cache.clear();
    cache.fit(fakeUi("Mono"), ctx, "SHOP", 200, base, false);
    expect(after() - start).toBe(6);
  });

  it("stays bounded", () => {
    const cache = new TextLayoutCache();
    const { ctx, log } = fakeCanvas();
    const ui = fakeUi("Mono");
    for (let index = 0; index < 1_100; index += 1)
      cache.fit(ui, ctx, `label ${String(index)}`, 500, { size: 10 }, false);
    const measured = log.measured;
    cache.fit(ui, ctx, "label 0", 500, { size: 10 }, false);
    expect(log.measured).toBe(measured + 1);
    cache.fit(ui, ctx, "label 1099", 500, { size: 10 }, false);
    expect(log.measured).toBe(measured + 1);
  });
});

describe("space-separated wrap", () => {
  const width = (text: string) => text.length;

  it("wraps greedily on single spaces", () => {
    expect(wrapSpaceSeparated(width, "aa bb cc dd", 5)).toEqual(["aa bb", "cc dd"]);
    expect(wrapSpaceSeparated(width, "toolongword x", 5)).toEqual(["toolongword", "x"]);
  });

  it("keeps empty words and newlines as written and drops a trailing empty line", () => {
    expect(wrapSpaceSeparated(width, "a  b", 10)).toEqual(["a  b"]);
    expect(wrapSpaceSeparated(width, "a\nb c", 10)).toEqual(["a\nb c"]);
    expect(wrapSpaceSeparated(width, "", 10)).toEqual([]);
  });
});
