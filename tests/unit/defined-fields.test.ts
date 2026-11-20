import { describe, expect, it } from "vitest";
import { definedFields } from "../../src/domain/records";

describe("definedFields", () => {
  it("passes on the named fields that are set and leaves undefined and null ones absent", () => {
    const options: { mode?: string; seed: string; looks?: object | null; zero?: number; flag?: boolean } = {
      seed: "s",
      zero: 0,
      flag: false,
      looks: null,
    };
    const picked = definedFields(options, ["mode", "zero", "flag", "looks"]);
    expect(picked).toEqual({ zero: 0, flag: false });
    expect(Object.keys(picked)).toEqual(["zero", "flag"]);
  });
});
