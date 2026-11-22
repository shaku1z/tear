import { describe, expect, it } from "vitest";
import { LegacyGhostEngine, type ReplayStore } from "../../src/replay/legacy-compat";
import { SemanticInputBuffer } from "../../src/input/semantic-buffer";

// The older (Ghost 2) replay showed the stage a run ended in from its first second: the opening stage
// is entered before recording starts, and playback fell back to the summary's end stage.
const store: ReplayStore = { get: () => null, set: () => undefined };

function engine(): LegacyGhostEngine {
  return new LegacyGhostEngine({
    store,
    document: {} as Document,
    now: () => 1,
    random: () => 0.5,
    semanticInput: new SemanticInputBuffer(),
    defaults: {
      rulesetVersion: "rules-a",
      build: { version: "0.1.0", revision: "abc", target: "standalone" },
      ticksPerSecond: 120,
      weaponId: "sword",
      weaponSchemaVersion: "final-five-v1",
      tearScore: () => ({
        enabled: true,
        engineVersion: "0.1",
        scoreVersion: "score-a",
        seed: "music-a",
        eventJournalHash: "journal-a",
      }),
    },
  });
}

function sample(ghost: LegacyGhostEngine, count: number): void {
  for (let index = 0; index < count; index += 1)
    ghost.sample(0.1, { x: index, y: 400, facing: 1 }, { tipX: index + 20, tipY: 380 }, []);
}

/** A campaign run that enters stage 0 before recording, stage 1 at 3 s and stage 2 at 6 s, and ends in stage 2. */
function multiStage(ghost: LegacyGhostEngine) {
  ghost.stage(0);
  ghost.startRec({ runId: "run-stages", seed: "515303" });
  sample(ghost, 30);
  ghost.stage(1);
  sample(ghost, 30);
  ghost.stage(2);
  sample(ghost, 30);
  return ghost.stopRec({ mode: "campaign", score: 900, stage: 2 });
}

describe("the older replay's stage at a moment", () => {
  it("shows the run's first stage at its start and each later stage from when it was entered", () => {
    const ghost = engine();
    const packet = multiStage(ghost);
    expect(ghost.begin(JSON.parse(JSON.stringify(packet)) as unknown)).not.toBeNull();
    const at = (seconds: number) => {
      ghost.seek(seconds);
      return ghost.stageAt();
    };
    expect([at(0), at(2.9), at(3.1), at(5.9), at(6.1), at(8.9)]).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("reads an earlier recording without a start stage as starting in the stage before the first entered", () => {
    // Recorded by an engine that never saw the opening stage, as every earlier build did.
    const ghost = engine();
    ghost.startRec({ runId: "run-earlier", seed: "515303" });
    sample(ghost, 30);
    ghost.stage(1);
    sample(ghost, 30);
    const packet = ghost.stopRec({ mode: "campaign", score: 900, stage: 1 });
    expect(ghost.begin(JSON.parse(JSON.stringify(packet)) as unknown)).not.toBeNull();
    ghost.seek(0);
    expect(ghost.stageAt()).toBe(0);
  });

  it("keeps the stage in effect at the cut when a long recording drops its oldest samples", () => {
    const ghost = engine();
    ghost.stage(0);
    ghost.startRec({ runId: "run-long", seed: "1" });
    sample(ghost, 100);
    ghost.stage(1);
    sample(ghost, 9_000);
    ghost.stage(2);
    sample(ghost, 30);
    const packet = ghost.stopRec({ mode: "campaign", score: 1, stage: 2 });
    expect(ghost.begin(JSON.parse(JSON.stringify(packet)) as unknown)).not.toBeNull();
    ghost.seek(0);
    expect(ghost.stageAt()).toBe(1);
  });
});
