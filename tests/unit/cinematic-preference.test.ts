import { describe, expect, it } from "vitest";

import { chapterLaunchPolicy, cinematicLaunchPolicy, sanitizeCinematicPreference } from "../../src/app/campaign/cinematic-preference";

describe("cinematic preference policy", () => {
  it.each([
    ["full", { play: true, brief: false }],
    ["brief", { play: true, brief: true }],
    ["off", { play: false, brief: false }],
  ] as const)("maps %s to an explicit launch decision", (preference, expected) => {
    expect(cinematicLaunchPolicy(preference)).toEqual(expected);
  });

  it("keeps a chapter's first viewing on the preference and skips a chapter already seen", () => {
    expect(chapterLaunchPolicy("full", false)).toEqual({ play: true, brief: false });
    expect(chapterLaunchPolicy("brief", false)).toEqual({ play: true, brief: true });
    expect(chapterLaunchPolicy("off", false)).toEqual({ play: false, brief: false });
    expect(chapterLaunchPolicy("full", true)).toEqual({ play: false, brief: false });
    expect(chapterLaunchPolicy("brief", true)).toEqual({ play: false, brief: true });
    expect(chapterLaunchPolicy("off", true)).toEqual({ play: false, brief: false });
  });

  it("uses full as the safe fallback for malformed persisted values", () => {
    expect(sanitizeCinematicPreference("unknown")).toBe("full");
    expect(sanitizeCinematicPreference(null)).toBe("full");
  });
});
