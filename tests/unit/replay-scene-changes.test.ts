/**
 * Every place outside the cinematic director that starts, moves, skips or ends a scene, and how a replay
 * record holds that change.
 *
 * A record holds a run's seed, start choices, actions and the scene frames live play sampled (each frame's
 * time and confirm presses). The detached world re-simulates from those alone, so a scene change live play
 * makes from anything else (a skip asked of the director directly, say) is in no record, and the
 * re-simulated run plays a different scene from there on. That is how a campaign run whose opening chapter
 * the test hooks skipped stopped verifying at its first checkpoint: the hook asked the director to skip,
 * and the record had no press for it. A skip now reaches a scene only through a frame's confirm.
 *
 * The rule fails when a new call is added without saying how its record holds it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type How =
  /** The frame's confirm presses: sampled live, recorded, and played before the next tick by verify and watch. */
  | "recorded-input"
  /** Inside the simulation (a tick, or a scene script the director runs): the same in both worlds. */
  | "simulated"
  /** Before a run's first tick or after its last recorded one, so no recorded tick sees it. */
  | "run-boundary"
  /** The detached world, which plays the record. */
  | "replay"
  /** A run that is never recorded. */
  | "not-recorded"
  /** Engineering and test tooling a player never reaches; not a player's skip. */
  | "engineering";

const SCENE_CHANGES: readonly Readonly<{ site: string; how: How; why: string }>[] = [
  {
    site: "src/app/shell/runtime-frame-coordinator.ts",
    how: "recorded-input",
    why: "the live frame: the confirm it samples is the frame the replay tap records, then the scene updates on it",
  },
  {
    site: "src/app/campaign/campaign-host.ts",
    how: "simulated",
    why: "the campaign runtime's scene ports; the detached world binds the same runtime (detached-run-start.ts)",
  },
  {
    site: "src/gameplay/campaign/chapter-cinematic-binding.ts",
    how: "simulated",
    why: "a chapter script's own skip target, run by the director on a recorded skip",
  },
  {
    site: "src/gameplay/campaign/finale-runtime.ts",
    how: "simulated",
    why: "the finale's scene and its skip target, run by the director",
  },
  {
    site: "src/gameplay/campaign/cinematic-launch-runtime.ts",
    how: "simulated",
    why: "a boss ritual, started by the boss's arrival in a tick",
  },
  { site: "src/app/world/run-stage.ts", how: "simulated", why: "a stage change inside a tick ends its scene" },
  {
    site: "src/app/run/run-start-world.ts",
    how: "run-boundary",
    why: "a new run clears the last run's scene before its first tick, through the one run start",
  },
  {
    site: "src/app/run/outcome-composition.ts",
    how: "run-boundary",
    why: "a death or a win ends the record with the run (tests/unit/replay-run-ends.test.ts)",
  },
  {
    site: "src/app/run/run-screen-adapters.ts",
    how: "run-boundary",
    why: "QUIT: the scene ends with the run, between ticks, after the last recorded one",
  },
  {
    site: "src/app/shell/game-runtime.ts",
    how: "not-recorded",
    why: "a practice reset (Playground): never recorded",
  },
  { site: "src/app/world/detached/detached-run-start.ts", how: "replay", why: "the replay's run start" },
  { site: "src/app/world/detached/finale-runtime.ts", how: "replay", why: "the replay's finale" },
  { site: "src/app/world/detached/replay-composition.ts", how: "replay", why: "plays the recorded frames" },
  { site: "src/app/world/detached/world-factory.ts", how: "replay", why: "the replay world's practice reset" },
  {
    site: "src/app/engineering/debug-harness.ts",
    how: "engineering",
    why: "the debug terminal and TearBench state setup; not in release builds",
  },
  {
    site: "src/app/engineering/state-setup-cinematic-advance.ts",
    how: "engineering",
    why: "TearBench State Setup's one-beat advance; not in release builds",
  },
];

/** A call that starts, moves, skips, updates or ends a scene, on the cinema or on a script's director. */
const SCENE_CHANGE =
  /\b(?:CINEMA|cinema)\??\.(?:requestSkip|skipTo|advance|cancel|complete|start|update)\(|\bdirector\.(?:requestSkip|skipTo|advance|complete|cancel)\(/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path.replace(/\\/gu, "/")] : [];
  });
}

describe("every scene change outside the director", () => {
  const sites = ["src/app", "src/gameplay", "src/agents", "src/tearbench"]
    .flatMap(sourceFiles)
    .filter((file) => file !== "src/gameplay/runtime/cinematic-director.ts")
    .filter((file) => SCENE_CHANGE.test(readFileSync(file, "utf8")));

  it("is listed with how its replay record holds it", () => {
    expect(sites.sort()).toEqual(SCENE_CHANGES.map((row) => row.site).sort());
  });

  it("asks the director to skip only from engineering tools; a player's skip and the test hooks' are a held confirm", () => {
    const skips = sites.filter((file) => readFileSync(file, "utf8").includes(".requestSkip("));
    const engineering = SCENE_CHANGES.filter((row) => row.how === "engineering").map((row) => row.site);
    expect(skips.filter((file) => !engineering.includes(file))).toEqual([]);
    expect(engineering.every((file) => file.startsWith("src/app/engineering/"))).toBe(true);
  });
});
