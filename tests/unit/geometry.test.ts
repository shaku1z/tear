import { describe, expect, it } from "vitest";
import { aabbOverlap, lerpAngle, segCircle, segSegmentDist } from "../../src/domain/geometry";

describe("simulation geometry", () => {
  it("uses the shortest path when interpolating angles", () => {
    expect(lerpAngle(Math.PI * 0.9, -Math.PI * 0.9, 0.5)).toBeCloseTo(Math.PI);
  });

  it("detects segment intersections and circle hits", () => {
    expect(segSegmentDist(0, 0, 10, 10, 0, 10, 10, 0)).toBe(0);
    expect(segCircle(0, 0, 10, 0, 5, 1, 1)).toBe(true);
  });

  it("does not treat touching rectangle edges as overlap", () => {
    expect(aabbOverlap(0, 0, 5, 5, 10, 0, 5, 5)).toBe(false);
  });
});
