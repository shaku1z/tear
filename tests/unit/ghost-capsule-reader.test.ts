import { describe, expect, it } from "vitest";
import { validateGhostCapsuleEntries } from "../../src/ghost/capsule-reader";

describe("shared pure Ghost Reader entry validation", () => {
  it("checks readable entries without cloning or retaining their expanded values", () => {
    const value = { data: [1, 2, 3] }, entries = [{ kind: "commands", tick: 1, value }];
    validateGhostCapsuleEntries(entries, "commands", 1, 1, 1);
    expect(entries[0]?.value).toBe(value); expect(Object.isFrozen(value)).toBe(false);
  });
  it.each([{}, [{ kind: "events", tick: 1, value: {} }], [{ kind: "commands", tick: 0, value: {} }], [{ kind: "commands", tick: 1 }]])("refuses unreadable %j", (entries) => {
    expect(() => { validateGhostCapsuleEntries(entries, "commands", 1, 1, 1); }).toThrow();
  });
  it("rejects excess entries before walking or cloning entry values", () => {
    let reads = 0; const entries = [{ get value() { reads++; return {}; } }];
    expect(() => { validateGhostCapsuleEntries(entries, "commands", 1, 1, 0); }).toThrow(/entry limit/); expect(reads).toBe(0);
  });
});
