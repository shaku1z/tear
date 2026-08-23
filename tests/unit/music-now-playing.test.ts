import { describe, expect, it } from "vitest";
import {
  getNowPlaying,
  nowPlayingDetail,
  nowPlayingLabel,
  onNowPlayingChange,
  setNowPlaying,
} from "../../src/audio/music/now-playing";
import {
  getActiveStation,
  isStationChoice,
  setActiveStation,
  stationLabel,
} from "../../src/audio/music/active-station";

describe("Now Playing", () => {
  it("labels the card with work and station", () => {
    setNowPlaying({ workId: "beserker", title: "Beserker", stationId: "cutline", stationName: "CUTLINE", tier: 3 });
    expect(nowPlayingLabel()).toBe("BESERKER · CUTLINE");
    expect(nowPlayingDetail()).toContain("PRESSURE");
  });

  it("omits the station when routing is canonical", () => {
    setNowPlaying({ workId: "the-source", title: "The Source", stationId: null, stationName: null, tier: 0 });
    expect(nowPlayingLabel()).toBe("THE SOURCE");
    expect(nowPlayingDetail()).toContain("BREATH");
  });

  it("uses Music in empty-state and detail accessibility labels", () => {
    expect(nowPlayingLabel({ workId: "", title: "—", stationId: null, stationName: null, tier: 0 })).toBe("MUSIC — NO TRACK");
    expect(nowPlayingDetail({ workId: "a", title: "A", stationId: null, stationName: null, tier: 0 })).toContain("MUSIC");
  });

  it("notifies listeners only when something actually changed", () => {
    setNowPlaying({ workId: "a", title: "A", stationId: null, stationName: null, tier: 1 });
    let calls = 0;
    const stop = onNowPlayingChange(() => calls++);
    setNowPlaying({ workId: "a", title: "A", stationId: null, stationName: null, tier: 1 });
    expect(calls).toBe(0);
    setNowPlaying({ tier: 2 });
    expect(calls).toBe(1);
    stop();
    expect(getNowPlaying().tier).toBe(2);
  });
});

describe("active station", () => {
  it("defaults to canonical and validates choices", () => {
    expect(isStationChoice("cutline")).toBe(true);
    expect(isStationChoice("nope")).toBe(false);
    setActiveStation("nope");
    expect(getActiveStation()).toBe("canonical");
  });

  it("sets a valid station and labels it", () => {
    setActiveStation("voidcast");
    expect(getActiveStation()).toBe("voidcast");
    expect(stationLabel("voidcast")).toBe("VOIDCAST");
    setActiveStation("canonical");
  });
});
