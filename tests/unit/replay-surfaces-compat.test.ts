import { describe, expect, it, vi } from "vitest";

import {
  createReplayEditorEdl,
  createStudioEdl,
  renderReplayEditorMediaLocally,
  renderStudioMediaLocally,
  createGhostV3,
  type GhostReplayTrident,
} from "../../src/ghost";
import {
  REPLAY_EDITOR_ACTIONS,
  LEGACY_REPLAY_EDITOR_ACTIONS,
  REPLAY_HUB_ACTIONS,
  LEGACY_REPLAY_HUB_ACTIONS,
  REPLAY_EDITOR_SCREEN,
  REPLAY_HUB_SCREEN,
  normalizeReplaySurfaceSearch,
  requestedReplaySurface,
  resolveReplaySurfaceRoute,
  writeReplaySurfaceSearch,
} from "../../src/replay";
import { stableVerificationHash } from "../../src/replay/hash";
import { createLiveReplayEditor } from "../../src/app/replay-editor";
import { createLiveReplayScreenAdapter } from "../../src/app/live-replay-screen-adapter";
import { createLiveReplayHub, createLiveGhostLabHome } from "../../src/app/replay-hub";
import {
  LEGACY_GHOST_LAB_DOM_SELECTORS,
  REPLAY_HUB_DOM_SELECTOR_ALIASES,
  REPLAY_HUB_DOM_SELECTORS,
} from "../../src/tearbench/browser/replay-hub-selectors";
import { isReplayHubRequested } from "../../src/tearbench/browser/replay-hub-route";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "test" },
  visual: { kind: "visual", status: "verified", available: true, resumable: false, seekable: true, reason: "test" },
};

function sourceGhost() {
  return createGhostV3({
    id: "replay-surfaces-source",
    rulesetVersion: "rules",
    sourceClassification: "native-v3",
    trident,
    actions: [{ kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } }],
    snapshots: [], events: [], visual: { samples: [1, 2, 3] },
  });
}

describe("Replay Editor and Replay Hub compatibility facades", () => {
  it("resolves canonical routes while reading the replay screen and legacy Ghost tokens", () => {
    expect(REPLAY_EDITOR_SCREEN).toBe("replay");
    expect(REPLAY_HUB_SCREEN).toBe("ghostlab");
    expect(resolveReplaySurfaceRoute("replay-editor")).toBe("replay-editor");
    expect(resolveReplaySurfaceRoute("replay.studio")).toBe("replay-editor");
    expect(resolveReplaySurfaceRoute("replay")).toBe("replay-editor");
    expect(resolveReplaySurfaceRoute("replay-hub")).toBe("replay-hub");
    expect(resolveReplaySurfaceRoute("ghostlab")).toBe("replay-hub");
    expect(resolveReplaySurfaceRoute("unknown")).toBeUndefined();
  });

  it("reads hub bookmarks and writes only the canonical query spelling", () => {
    expect(isReplayHubRequested("?test=1&ghostlab=1")).toBe(true);
    expect(isReplayHubRequested("?test=1&ghostlab=0")).toBe(false);
    expect(requestedReplaySurface("?test=1&ghostlab=1")).toBe("replay-hub");
    expect(normalizeReplaySurfaceSearch("?test=1&ghostlab=1")).toBe("?test=1&replay-hub=1");
    expect(writeReplaySurfaceSearch("?test=1", "replay-editor")).toBe("?test=1&replay-editor=1");
    expect(writeReplaySurfaceSearch("?test=1&ghostlab=1", "replay-editor")).toBe("?test=1&replay-editor=1");
    expect(normalizeReplaySurfaceSearch("?test=1&replay-editor=1")).toBe("?test=1&replay-editor=1");
    expect(normalizeReplaySurfaceSearch("?test=1&ghostlab=0")).toBe("?test=1&ghostlab=0");
  });

  it("keeps canonical and legacy action vocabularies semantically paired", () => {
    expect(REPLAY_EDITOR_ACTIONS).toEqual({ toggle: "replay.editor.toggle", createCutList: "replay.editor.createCutList" });
    expect(LEGACY_REPLAY_EDITOR_ACTIONS).toEqual({ toggle: "replay.studio.toggle", createCutList: "replay.studio.createCutList" });
    expect(REPLAY_HUB_ACTIONS).toEqual({ open: "replay.hub.open", watch: "replay.hub.watch" });
    expect(LEGACY_REPLAY_HUB_ACTIONS).toEqual({ open: "ghostlab.open", watch: "ghostlab.watch" });
    expect(createLiveReplayEditor).toBe(createLiveReplayScreenAdapter);
    expect(createLiveReplayHub).toBe(createLiveGhostLabHome);
  });

  it("preserves panel selectors while adding canonical Replay Hub selectors", () => {
    expect(REPLAY_HUB_DOM_SELECTORS.root).toBe('[data-surface="replay-hub"]');
    expect(REPLAY_HUB_DOM_SELECTOR_ALIASES.root).toContain(LEGACY_GHOST_LAB_DOM_SELECTORS.root);
    expect(REPLAY_HUB_DOM_SELECTOR_ALIASES.state).toContain(LEGACY_GHOST_LAB_DOM_SELECTORS.state);
  });

  it("creates and exports the exact EDL v1 bytes and hashes through both APIs", async () => {
    const source = sourceGhost();
    const sourceBefore = JSON.stringify(source);
    const input = {
      id: "replay-editor-cut",
      sourceGhostId: source.id,
      sourceRootHash: source.rootHash,
      aspectRatio: "16:9" as const,
      title: "Local cut",
      credits: "Local Player",
      clips: [{ id: "opening", sourceFromTick: 0, sourceToTick: 1, outputOrder: 0, speed: 1 as const, camera: "source" as const }],
    };
    const legacy = createStudioEdl(input);
    const canonical = createReplayEditorEdl(input);
    expect(canonical).toEqual(legacy);
    expect(stableVerificationHash(canonical)).toBe(stableVerificationHash(legacy));
    expect(canonical.format).toBe("ghost-studio-edl");
    expect(canonical.schemaVersion).toBe(1);
    expect(canonical.sourceGhostId).toBe(source.id);
    expect(canonical.sourceRootHash).toBe(source.rootHash);

    const render = vi.fn(({ source: value, edl }: { source: typeof source; edl: typeof canonical }) => Promise.resolve({
      mimeType: "video/webm" as const,
      bytes: new TextEncoder().encode(`${value.id}:${edl.edlHash}:${String(edl.clips[0]?.sourceToTick)}`),
      thumbnail: "data:image/png;base64,replay-editor",
    }));
    const legacyExport = await renderStudioMediaLocally(source, legacy, { render });
    const canonicalExport = await renderReplayEditorMediaLocally(source, canonical, { render });
    expect(canonicalExport).toEqual(legacyExport);
    expect(stableVerificationHash(canonicalExport)).toBe(stableVerificationHash(legacyExport));
    expect(canonicalExport.edlHash).toBe(legacy.edlHash);
    expect(JSON.stringify(source)).toBe(sourceBefore);
  });
});
