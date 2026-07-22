import { describe, expect, it, vi } from "vitest";
import {
  createLegacyInputCompatibility,
  type LegacyBrowserPorts,
} from "../../src/input/legacy-compat";

describe("legacy input compatibility composition", () => {
  it("injects dependencies and preserves the callable lexical identifiers", () => {
    const ports: LegacyBrowserPorts = {
      config: { view: { w: 1_600, h: 900 } },
      safeArea: { l: 0, r: 0, t: 0, b: 0 },
      overscan: { x: 0, y: 0 },
      window: {} as Window,
      document: {} as Document,
      navigator: {} as Navigator,
      performance: {} as Performance,
    };
    const Input = { name: "Input" };
    const PAD = { name: "PAD" };
    const PAD_PRESETS = { default: { jump: [0] } };
    const createInput = vi.fn(() => Input);
    const createGamepad = vi.fn(() => ({ PAD, PAD_PRESETS }));

    const compatibility = createLegacyInputCompatibility(ports, { createInput, createGamepad });

    expect(compatibility).toMatchObject({ Input, PAD, PAD_PRESETS });
    expect(createInput).toHaveBeenCalledWith(expect.objectContaining({ config: ports.config, semantic: compatibility.semanticInput }));
    expect(createGamepad).toHaveBeenCalledWith(expect.objectContaining({ input: Input, semantic: compatibility.semanticInput }));
  });
});
