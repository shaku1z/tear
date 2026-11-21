import { describe, expect, it } from "vitest";
import { bossDebugFlags } from "../../src/app/shell/browser-runtime";

const query = (search: string) => new URLSearchParams(search);

describe("boss debug flags", () => {
  it("installs the harness and draws its overlay with bossdebug=1 in a test build", () => {
    expect(bossDebugFlags(true, query("test=1&bossdebug=1"))).toEqual({ hooks: true, overlay: true });
  });

  it("keeps the harness and draws no overlay with overlay=0", () => {
    expect(bossDebugFlags(true, query("test=1&bossdebug=1&overlay=0"))).toEqual({ hooks: true, overlay: false });
  });

  it("draws no overlay without the harness", () => {
    expect(bossDebugFlags(true, query("test=1"))).toEqual({ hooks: false, overlay: false });
    expect(bossDebugFlags(true, query("test=1&overlay=1"))).toEqual({ hooks: false, overlay: false });
  });

  it("gives a production build neither, whatever the query says", () => {
    expect(bossDebugFlags(false, query("test=1&bossdebug=1"))).toEqual({ hooks: false, overlay: false });
    expect(bossDebugFlags(false, query("bossdebug=1&overlay=1"))).toEqual({ hooks: false, overlay: false });
  });
});
