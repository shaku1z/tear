import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  createCampaignChapterBindingSpec,
  stageCampaignChapterBinding,
} from "../../src/gameplay/campaign/chapter-cinematic-binding";
import type { CampaignChapterTiming } from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline, type CinematicScript } from "../../src/gameplay/runtime/cinematic-director";
import { STAGES } from "../../src/gameplay/stages";
import { createUiState } from "../../src/presentation/ui-tokens";

const TICK = 1 / 120;
const tokens = createUiState({ bomber: "#f80", charger: "#e33", perfect: "#1cc" }).t;
const timing: CampaignChapterTiming = Object.freeze({
  ...tokens.motion,
  dialogueDuck: CONFIG.presentation.dialogueDuck,
  biomeRevealDuck: CONFIG.presentation.biomeRevealDuck,
});

type Press = (beat: string, elapsed: number) => boolean;
interface Scene {
  readonly script: CinematicScript;
  readonly context?: Readonly<Record<string, unknown>>;
}
interface Visit {
  readonly beat: string;
  readonly seconds: number;
}

function chapter(stageIndex: number, brief: boolean): Scene {
  const stage = STAGES[stageIndex];
  if (stage === undefined) throw new Error(`missing stage ${String(stageIndex)}`);
  const spec = createCampaignChapterBindingSpec({
    stageIndex,
    priorOutro: STAGES[stageIndex - 1]?.chapter.bossOutro ?? null,
    brief,
    prologueShownBefore: false,
    timing,
  });
  return stageCampaignChapterBinding(spec, stage, {
    dispatch: () => undefined,
    preparedWave: () => true,
    activationDeferred: () => true,
    clear: () => undefined,
  }).binding;
}

/** Plays a script at the simulation rate. `press` starts a short key press; it returns each beat's length. */
function play(scene: Scene, press: Press = () => false): readonly Visit[] {
  const director = new CinematicTimeline.Director(CONFIG);
  director.start(scene.script, scene.context ?? {});
  const visits: Visit[] = [];
  let beat = director.beatId ?? "";
  let entered = 0;
  let held = 0;
  let tick = 0;
  for (; director.active && tick < 120 * 600; tick += 1) {
    if (held === 0 && press(beat, director.elapsed)) held = 6;
    director.update(TICK, { key: held > 0 });
    if (held > 0) held -= 1;
    const now = director.beatId ?? "";
    if (now !== beat) {
      visits.push({ beat, seconds: (tick + 1 - entered) * TICK });
      beat = now;
      entered = tick + 1;
    }
  }
  expect(director.active, "the script ends").toBe(false);
  return visits;
}

const every = STAGES.flatMap((_stage, stageIndex) =>
  [false, true].map((brief) => ({
    stageIndex,
    brief,
    name: `stage ${String(stageIndex)} ${brief ? "brief" : "full"}`,
  })),
);
const isPage = (beat: string) => beat.startsWith("page-");
const seconds = (visits: readonly Visit[], beat: string) => visits.find((visit) => visit.beat === beat)?.seconds;

describe("chapter opening: from the last page to play", () => {
  it("waits for the player on pages only", () => {
    for (const entry of every) {
      for (const beat of chapter(entry.stageIndex, entry.brief).script.beats) {
        const waits = beat.completion === "confirm" || beat.completion === "confirm-or-timeout";
        expect(waits, `${entry.name} ${beat.id}`).toBe(isPage(beat.id));
        if (!waits) expect(beat.completion, `${entry.name} ${beat.id}`).toBe("timed");
      }
    }
  });

  it("plays the exit, the biome name and READY for their authored durations with no input", () => {
    for (const entry of every) {
      const visits = play(chapter(entry.stageIndex, entry.brief));
      const m = tokens.motion;
      expect(seconds(visits, "exit"), entry.name).toBeCloseTo(m.loreExit, 1);
      expect(seconds(visits, "reveal"), entry.name).toBeCloseTo(
        entry.brief ? m.biomeRevealBrief : m.biomeRevealFull,
        1,
      );
      expect(seconds(visits, "ready"), entry.name).toBeCloseTo(entry.brief ? m.readyBrief : m.readyFull, 1);
    }
  });

  it("carries one press on the last page straight through to play", () => {
    for (const entry of every) {
      const script = chapter(entry.stageIndex, entry.brief);
      const pressed = new Set<string>();
      // One press per page, a second after it appears, and nothing afterwards.
      const visits = play(script, (beat, elapsed) => {
        if (!isPage(beat) || elapsed < 1 || pressed.has(beat)) return false;
        pressed.add(beat);
        return true;
      });
      const m = tokens.motion;
      const afterPages = visits.filter((visit) => !isPage(visit.beat) && visit.beat !== "enter");
      const total = afterPages.reduce((sum, visit) => sum + visit.seconds, 0);
      const authored = m.loreExit + (entry.brief ? m.biomeRevealBrief + m.readyBrief : m.biomeRevealFull + m.readyFull);
      expect(
        afterPages.map((visit) => visit.beat),
        entry.name,
      ).toEqual(["exit", "reveal", "ready"]);
      expect(total, entry.name).toBeCloseTo(authored, 1);
    }
  });

  it("never spends a press on a beat that does not wait: it moves the beat on", () => {
    for (const entry of every) {
      const pressed = new Set<string>();
      const visits = play(chapter(entry.stageIndex, entry.brief), (beat, elapsed) => {
        if (elapsed < 0.3 || pressed.has(beat)) return false;
        if (isPage(beat) && elapsed < 1) return false;
        pressed.add(beat);
        return true;
      });
      for (const beat of ["reveal", "ready"]) {
        expect(seconds(visits, beat), `${entry.name} ${beat}`).toBeLessThan(0.45);
      }
    }
  });
});

describe("cinematic director: waiting is declared, never inferred", () => {
  it("plays a beat that shows a line for its authored duration", () => {
    const visits = play({
      script: {
        id: "rule",
        beats: [
          { id: "shown", duration: 1, line: "A long line the player is shown, with commas, and stops. And more." },
        ],
      },
    });
    expect(visits).toHaveLength(1);
    expect(visits[0]?.seconds).toBeCloseTo(1, 1);
  });

  it("holds a beat for the player only when its script says so", () => {
    const visits = play({
      script: {
        id: "rule",
        beats: [{ id: "spoken", completion: "confirm-or-timeout", line: "A spoken line." }],
      },
    });
    expect(visits[0]?.seconds).toBeGreaterThanOrEqual(CONFIG.presentation.bossAutoMin);
  });
});
