import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFoundryPreviewProbe,
  requestedFoundryPreview,
} from "../../src/audio/foundry-preview";
import type { StemCueManifest } from "../../src/audio/stems/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Foundry audio preview bridge", () => {
  it("accepts only a content-shaped session and a real tier", () => {
    expect(
      requestedFoundryPreview(
        "?foundryPreview=0123456789abcdef0123456789abcdef&foundryTier=3",
      ),
    ).toEqual({
      sessionId: "0123456789abcdef0123456789abcdef",
      fixedTier: 3,
    });
    expect(
      requestedFoundryPreview("?foundryPreview=unsafe&foundryTier=3"),
    ).toBeNull();
    expect(
      requestedFoundryPreview(
        "?foundryPreview=0123456789abcdef0123456789abcdef&foundryTier=7",
      ),
    ).toBeNull();
    expect(
      requestedFoundryPreview(
        "?foundryPreview=0123456789abcdef0123456789abcdef&foundryTier=2&foundryTelemetry=http%3A%2F%2F127.0.0.1%3A4646%2Fapi%2Fv1%2Fgame-previews%2F0123456789abcdef0123456789abcdef%2Ftelemetry&foundryTelemetryToken=0123456789abcdefghijklmnop",
      ),
    ).toEqual({
      sessionId: "0123456789abcdef0123456789abcdef",
      fixedTier: 2,
      telemetryUrl:
        "http://127.0.0.1:4646/api/v1/game-previews/0123456789abcdef0123456789abcdef/telemetry",
      telemetryToken: "0123456789abcdefghijklmnop",
    });
    expect(
      requestedFoundryPreview(
        "?foundryPreview=0123456789abcdef0123456789abcdef&foundryTier=2&foundryTelemetry=https%3A%2F%2Fevil.example%2Ftelemetry&foundryTelemetryToken=0123456789abcdefghijklmnop",
      ),
    ).toEqual({
      sessionId: "0123456789abcdef0123456789abcdef",
      fixedTier: 2,
    });
    expect(
      requestedFoundryPreview(
        "?foundryPreview=0123456789abcdef0123456789abcdef&foundryTier=2&foundryPreviewMode=dynamic&foundryPreviewScene=boss&foundryBossPhase=3",
      ),
    ).toEqual({
      sessionId: "0123456789abcdef0123456789abcdef",
      fixedTier: 2,
      mode: "dynamic",
      scenarioScene: "boss",
      bossPhase: 3,
    });
    expect(
      requestedFoundryPreview(
        "?foundryPreview=0123456789abcdef0123456789abcdef&foundryTier=2&foundryPreviewMode=louder",
      ),
    ).toBeNull();
  });

  it("publishes the actual cue, fixed tier, active lanes, grid, and memory", () => {
    vi.stubGlobal("window", {});
    const cue = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          "../../public/audio/cues/fillet/cue.json",
        ),
        "utf8",
      ),
    ) as StemCueManifest;
    const context = {
      sampleRate: 48_000,
      currentTime: 0,
      state: "running" as AudioContextState,
    };
    const publish = createFoundryPreviewProbe(
      {
        sessionId: "0123456789abcdef0123456789abcdef",
        fixedTier: 2,
      },
      cue,
      context,
      12.5,
    );
    publish("combat");
    expect(window.__TEAR_FOUNDRY_AUDIO_PREVIEW__).toMatchObject({
      cueId: "fillet",
      tier: 2,
      scene: "combat",
      paused: false,
      activeStemIds: Object.keys(cue.tiers[2]),
      allStemIds: cue.stems.map((stem) => stem.id),
      barQuantized: true,
      contextSampleRate: 48_000,
      contextState: "running",
      decodeLoadMs: 12.5,
      loopIteration: 0,
      bar: 1,
      beat: 1,
      updates: 1,
    });
    context.currentTime = cue.grid.barsPerLoop
      ? ((cue.loop.endFrame - cue.loop.startFrame) /
          cue.sourceSampleRate /
          cue.grid.barsPerLoop) *
        2.5
      : 0;
    publish("paused");
    expect(window.__TEAR_FOUNDRY_AUDIO_PREVIEW__).toMatchObject({
      tier: 2,
      scene: "paused",
      paused: true,
      bar: 3,
      updates: 2,
    });
  });
});
