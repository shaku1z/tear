import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SignalCatalog } from "../../src/audio/signal/catalog";
import {
  createStationState,
  pickNext,
  remember,
  toggleFavourite,
} from "../../src/audio/signal/station";

const catalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../public/audio/catalog.json"), "utf8"),
) as SignalCatalog;

describe("THE SIGNAL station engine", () => {
  it("picks a gameplay-safe entry from a station", () => {
    const entry = pickNext(catalog, "cutline", "gameplay", createStationState(), 1);
    expect(entry).not.toBeNull();
    expect(entry!.versionId).toBe("adaptive-game");
  });

  it("is deterministic for the same seed and state", () => {
    const state = createStationState();
    const a = pickNext(catalog, "still", "gameplay", state, 4242);
    const b = pickNext(catalog, "still", "gameplay", state, 4242);
    expect(a).toEqual(b);
  });

  it("avoids immediately repeating a recently played work", () => {
    let state = createStationState();
    const first = pickNext(catalog, "still", "gameplay", state, 7)!;
    state = remember(state, first.workId);
    const second = pickNext(catalog, "still", "gameplay", state, 7)!;
    expect(second.workId).not.toBe(first.workId);
  });

  it("still returns something when every work is inside the protection window", () => {
    let state = createStationState();
    for (const id of ["shopkeeper", "slicing-life-1", "slicing-life-2"]) state = remember(state, id);
    // protection would exclude everything; the window must relax, not go silent
    expect(pickNext(catalog, "still", "gameplay", state, 3)).not.toBeNull();
  });

  it("never programmes a linear-only station into gameplay", () => {
    expect(pickNext(catalog, "archive", "gameplay", createStationState(), 1)).toBeNull();
  });

  it("returns null for an unknown station", () => {
    expect(pickNext(catalog, "nope", "gameplay", createStationState(), 1)).toBeNull();
  });

  it("keeps history most-recent-first without duplicates", () => {
    let state = createStationState();
    state = remember(state, "a");
    state = remember(state, "b");
    state = remember(state, "a");
    expect(state.history).toEqual(["a", "b"]);
  });

  it("toggles favourites both ways", () => {
    let state = createStationState();
    state = toggleFavourite(state, "beserker");
    expect(state.favourites.has("beserker")).toBe(true);
    state = toggleFavourite(state, "beserker");
    expect(state.favourites.has("beserker")).toBe(false);
  });

  it("biases selection toward favourites over many seeds", () => {
    const plain = createStationState();
    const faved = toggleFavourite(createStationState(), "slicing-life-2");
    let plainHits = 0;
    let favedHits = 0;
    for (let seed = 0; seed < 200; seed++) {
      if (pickNext(catalog, "still", "gameplay", plain, seed)?.workId === "slicing-life-2") plainHits++;
      if (pickNext(catalog, "still", "gameplay", faved, seed)?.workId === "slicing-life-2") favedHits++;
    }
    expect(favedHits).toBeGreaterThan(plainHits);
  });
});
