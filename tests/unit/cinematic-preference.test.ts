import { describe, expect, it } from "vitest";

import { cinematicLaunchPolicy, sanitizeCinematicPreference } from "../../src/app/cinematic-preference";

describe("cinematic preference policy", () => {
  it.each([
    ["full", { play: true, brief: false }],
    ["brief", { play: true, brief: true }],
    ["off", { play: false, brief: false }],
  ] as const)("maps %s to an explicit launch decision", (preference, expected) => {
    expect(cinematicLaunchPolicy(preference)).toEqual(expected);
  });

  it("uses full as the safe fallback for malformed persisted values", () => {
    expect(sanitizeCinematicPreference("unknown")).toBe("full");
    expect(sanitizeCinematicPreference(null)).toBe("full");
  });
});
