/**
 * The replay screen over a kept record (src/app/replay/replay-screen.ts): it plays at once, takes the replay
 * bar and keyboard, lists INFO at the shown moment, launches practice from the shown moment and keeps the
 * replay editor's ranges.
 */
import { describe, expect, it, vi } from "vitest";

import { createKeptRunScreen, type KeptRunScreenServices } from "../../src/app/replay/replay-screen";
import type { ReplayClipExportPort } from "../../src/app/replay/browser-replay-clip-export";
import type { ReplayScreenView } from "../../src/presentation/screens/contracts";
import * as engineModule from "../../src/app/world/detached/replay-composition";
import { SIX_BIOME_PALE_PREVIEW_V5_RULESET_VERSION } from "../../src/gameplay/run/ruleset-version";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";

const spec = SPECS[0];
if (spec === undefined) throw new Error("no corpus stream");
const record = recordCorpusStream(spec);
const KEY = "record:test:1";

function keptScreen(overrides: Partial<KeptRunScreenServices> = {}) {
  const views: ReplayScreenView[] = [];
  const launchPractice = vi.fn<KeptRunScreenServices["launchPractice"]>(() => ({
    ok: false,
    message: "no live world here",
  }));
  const screen = createKeptRunScreen({
    render: (view) => views.push(view),
    deltaSeconds: () => 0,
    launchPractice,
    loadoutCards: (items) => items.map((item) => ({ id: item.id, label: item.id, footer: String(item.count) })),
    ...overrides,
  });
  expect(screen.open(record, KEY, "profile", engineModule)).toBeUndefined();
  return { screen, views, launchPractice };
}

describe("watching a kept run", () => {
  it("plays at once, and INFO lists the run and the upgrades held at the shown moment", () => {
    const { screen, views } = keptScreen({ deltaSeconds: () => 1 / 60 });
    expect(screen.status()?.paused).toBe(false);
    screen.render();
    expect(screen.shownTick()).toBe(2);

    screen.toggleInfo();
    screen.seekToFraction(1);
    screen.render();
    const view = views.at(-1);
    expect(view?.infoVisible).toBe(true);
    expect(view?.infoRows?.map((row) => row.label)).toEqual(["PLAYER", "RUN", "RESULT", "SCORE", "KILLS", "TIME"]);
    expect(view?.infoRows?.find((row) => row.label === "SCORE")?.value).toBe(
      record.summary.score.toLocaleString("en-US"),
    );
    expect(view?.loadoutHeading?.title).toBe("LOADOUT AT THIS MOMENT");
    expect(view?.loadout?.length).toBeGreaterThan(0);
    // Playing to the end paused the replay.
    expect(view?.paused).toBe(true);

    screen.seekToFraction(0);
    screen.render();
    expect(views.at(-1)?.loadout).toEqual([]);
  });

  it("takes the replay bar and the keyboard, except while the replay editor is open", () => {
    const pressed = new Set<string>(),
      takeClick = vi.fn(() => ({ x: 1120, y: 804 }));
    const controls = { clicked: true, clickX: 1120, clickY: 804, pressed, takeClick };
    const { screen, views } = keptScreen({
      nativeTransport: () => ({
        controls,
        scrub: { x: 220, y: 804, width: 1000 },
        consumeKey: (key: string) => {
          pressed.delete(key);
        },
      }),
      clipExport: unusedExport(),
    });
    const last = record.run.result.tick;
    screen.render();
    // The click sits nine tenths along the bar.
    expect(screen.shownTick()).toBe(Math.round(last * 0.9));
    expect(views.at(-1)?.progress).toBeCloseTo(0.9, 3);
    controls.clicked = false;
    pressed.add("Space");
    screen.render();
    expect(screen.status()?.paused).toBe(true);
    expect(pressed.has("Space")).toBe(false);
    pressed.add("ArrowLeft");
    screen.render();
    expect(screen.shownTick()).toBe(Math.round(last * 0.9) - 600);
    pressed.clear();
    pressed.add("ArrowRight");
    screen.render();
    expect(screen.shownTick()).toBe(Math.round(last * 0.9));
    screen.editor()?.toggle();
    controls.clicked = true;
    const accepted = takeClick.mock.calls.length;
    pressed.clear();
    pressed.add("ArrowLeft");
    screen.render();
    expect(screen.shownTick()).toBe(Math.round(last * 0.9));
    expect(takeClick).toHaveBeenCalledTimes(accepted);
  });

  it("launches unranked practice from the shown moment, holding the run it came from", () => {
    const { screen, views, launchPractice } = keptScreen();
    screen.seekBy(3);
    const tick = screen.shownTick() ?? 0;
    expect(tick).toBe(360);
    screen.render();
    expect(views.at(-1)?.practiceAvailable).toBe(true);
    screen.practice();
    const child = launchPractice.mock.calls[0]?.[0];
    expect(child).toMatchObject({
      sourceGhostId: KEY,
      sourceRootHash: record.run.result.hash,
      forkTick: tick,
      rankedEligible: false,
      leaderboardEligible: false,
      inputLatchPolicy: "release-all",
      lineage: { relation: "forked-at", parentId: KEY, parentRootHash: record.run.result.hash, forkTick: tick },
    });
    // The live launcher restores only a snapshot taken at the tick it forks from.
    expect(child?.snapshot.tick).toBe(tick);
    expect(screen.status()?.paused).toBe(true);
    screen.render();
    expect(views.at(-1)?.notice).toBe("no live world here");
  });

  it("keeps the editor's ranges in order with their speeds, and drops a cancelled encoding's late result", async () => {
    const signals: AbortSignal[] = [],
      sources: { id: string; lastTick: number }[] = [],
      download = vi.fn();
    let finish: ((value: never) => void) | undefined;
    const port: ReplayClipExportPort = {
      ...unusedExport(),
      download,
      render: (source, clips, signal) => {
        sources.push({ id: source.id, lastTick: source.lastTick });
        expect(clips.map((clip) => [clip.fromTick, clip.toTick, clip.speed])).toEqual([
          [240, 480, 0.5],
          [0, 120, 2],
        ]);
        signals.push(signal);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    };
    const { screen, views } = keptScreen({ clipExport: port });
    screen.togglePause();
    const editor = screen.editor();
    if (editor === undefined) throw new Error("no editor");
    editor.toggle();
    screen.seekBy(2);
    screen.markClipIn();
    screen.seekBy(2);
    screen.setSpeed(0.5);
    screen.appendClip();
    screen.restart();
    screen.seekBy(1);
    screen.setSpeed(2);
    screen.appendClip();
    editor.encode();
    screen.render();
    expect(views.at(-1)?.clipExport?.status).toBe("rendering");
    expect(views.at(-1)?.cutList?.clipCount).toBe(2);
    // The export draws from its own watch of the run; the replay on screen stays where it was.
    expect(sources).toEqual([{ id: KEY, lastTick: record.run.result.tick }]);
    expect(screen.shownTick()).toBe(120);
    editor.cancel();
    expect(signals[0]?.aborted).toBe(true);
    finish?.({ thumbnail: "late" } as never);
    await Promise.resolve();
    screen.render();
    expect(views.at(-1)?.clipExport?.status).toBe("cancelled");
    expect(views.at(-1)?.clipExport?.thumbnail).toBeUndefined();
    editor.download();
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses a record of retired rules with the change it missed, and opens nothing", () => {
    const screen = createKeptRunScreen({ render: vi.fn(), deltaSeconds: () => 0, launchPractice: vi.fn() });
    const old = { ...record, run: { ...record.run, ruleset: SIX_BIOME_PALE_PREVIEW_V5_RULESET_VERSION } };
    expect(screen.open(old, KEY, "profile", engineModule)).toBe(
      "This replay was recorded before the Gauntlet became a run of trials.",
    );
    expect(screen.status()).toBeNull();
  });
});

function unusedExport(): ReplayClipExportPort {
  return {
    available: () => true,
    render: () => Promise.reject(new Error("unused")),
    download: () => Promise.resolve(),
    dispose: vi.fn(),
  };
}
