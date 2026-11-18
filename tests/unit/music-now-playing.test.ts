import { describe, expect, it } from "vitest";
import {
  getNowPlaying,
  nowPlayingDetail,
  nowPlayingLabel,
  onNowPlayingChange,
  setNowPlaying,
} from "../../src/audio/music/now-playing";

describe("Now Playing", () => {
  it("labels the card with the song and the Radio channel playing it", () => {
    setNowPlaying({ workId: "beserker", title: "Beserker", channelId: "calm", channelName: "Calm", tier: 3 });
    expect(nowPlayingLabel()).toBe("BESERKER · CALM");
    expect(nowPlayingDetail()).toContain("PRESSURE");
  });

  it("names only the song when it is not playing on the Radio", () => {
    setNowPlaying({ workId: "the-source", title: "The Source", channelId: null, channelName: null, tier: 0 });
    expect(nowPlayingLabel()).toBe("THE SOURCE");
    expect(nowPlayingDetail()).toContain("BREATH");
  });

  it("uses Music in empty-state and detail accessibility labels", () => {
    expect(nowPlayingLabel({ workId: "", title: "—", channelId: null, channelName: null, tier: 0 })).toBe(
      "MUSIC — NO TRACK",
    );
    expect(nowPlayingDetail({ workId: "a", title: "A", channelId: null, channelName: null, tier: 0 })).toContain(
      "MUSIC",
    );
  });

  it("notifies listeners only when something actually changed", () => {
    setNowPlaying({ workId: "a", title: "A", channelId: null, channelName: null, tier: 1 });
    let calls = 0;
    const stop = onNowPlayingChange(() => calls++);
    setNowPlaying({ workId: "a", title: "A", channelId: null, channelName: null, tier: 1 });
    expect(calls).toBe(0);
    setNowPlaying({ tier: 2 });
    expect(calls).toBe(1);
    stop();
    expect(getNowPlaying().tier).toBe(2);
  });
});

