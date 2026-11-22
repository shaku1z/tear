import { createBrowserGhostReplayPresentation } from "../../src/app/replay/browser-ghost-replay-presentation";
import {
  createProductionGhostReplayComposition,
  projectProductionReplayCanonicalState,
} from "../../src/app/world/detached/replay-composition";
import { describe, expect, it } from "vitest";

import { GhostProductionReplayWorld } from "../../src/ghost/replay-world";
import { createGhostV3, type GhostReplayTrident } from "../../src/ghost/truth-kernel";
import { CONFIG } from "../../src/config/game-config";
import { createProductionCombatSimulation } from "../../src/app/world/detached/combat-simulation";
import { createProductionReplayWorld } from "../../src/app/world/detached/world-factory";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";

const trident: GhostReplayTrident = {
  command: {
    kind: "command",
    status: "verified",
    available: true,
    resumable: true,
    seekable: false,
    reason: "C29 test",
  },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "C29 test" },
  visual: { kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "C29 test" },
};

function productionComposition(created: unknown[]) {
  return {
    create(snapshot: undefined) {
      expect(snapshot).toBeUndefined();
      const detached = createProductionReplayWorld({
        runSeed: scenarioRunSeed("c29-production-replay"),
        enemies: [{ id: "charger", x: 760, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 }],
      });
      const core = createProductionCombatSimulation<Record<string, unknown>>(detached, {
        snapshot: (tick) => {
          const player = detached.world.state.player() as never as {
            x: number;
            y: number;
            vx: number;
            vy: number;
            hp: number;
          };
          const run = detached.world.state.run() as never as { wave: number; runTime: number };
          return Object.freeze({
            tick,
            player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp },
            run: { wave: run.wave, runTime: run.runTime },
          });
        },
      });
      core.simulationRuntime.reset(0);
      created.push(core.simulationRuntime);
      return Object.freeze({
        simulation: core.simulationRuntime,
        semanticProjection: () => core.simulationRuntime.lastResult?.state ?? Object.freeze({ tick: 0 }),
      });
    },
  };
}

/** A 1600x900 canvas whose context records every drawing call into `calls`. */
function recordingCanvas(calls: string[]) {
  const surface = { width: 1600, height: 900, getContext: () => context };
  const context = new Proxy(
    { canvas: surface },
    {
      has: () => true,
      get(target, key) {
        if (key === "canvas") return target.canvas;
        if (key === "createLinearGradient" || key === "createRadialGradient")
          return () => ({
            addColorStop() {
              return;
            },
          });
        if (key === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => {
          calls.push(`${String(key)}:${args.map(String).join(",")}`);
        };
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return surface;
}

const noDraw = () => undefined;

/** The replay presentation over recording canvases, with a stub UI kit. */
function replayPresentation(calls: string[]) {
  const document = { createElement: () => recordingCanvas(calls) } as unknown as Document;
  return createBrowserGhostReplayPresentation(document, {
    font: () => "12px sans-serif",
    tag: noDraw,
    text: noDraw,
    title: noDraw,
    bossHud: noDraw,
    chapterHeader: noDraw,
    loreFragment: noDraw,
    chapterPrompt: noDraw,
    biomeReveal: noDraw,
    cinematicFrame: noDraw,
    finaleFracture: noDraw,
    finalReward: noDraw,
    cinematicPrompt: noDraw,
    bossDeclaration: noDraw,
    dialogueCard: noDraw,
    ink: "#000",
    density: { touch: false, compact: false },
    readable: (color: string) => color,
    displayText: noDraw,
    fitText: (_canvas: unknown, text: string, _width: number, options: { size: number }) => ({
      size: options.size,
      lines: [text],
      truncated: false,
    }),
    textBox: (_canvas: unknown, text: string) => ({ size: 16, lines: [text], height: 24, lineHeight: 24 }),
    keycap: () => 30,
    keycapSize: () => ({ w: 30, h: 22 }),
    sheetRect: () => ({ x: 180, y: 44, w: 1240, h: 820 }),
    sheetFooter: () => ({ y: 804, h: 48, backX: 690 }),
    t: {
      type: { display: 40, h2: 28, title: 24, lead: 20, body: 16, label: 14, caption: 12, micro: 10 },
      alpha: { soft: 0.5, muted: 0.66, faint: 0.2 },
      color: { accent: "#f00", muted: "#888", paper: "#fff", danger: "#e44", scrim: "#06070c", scrimInk: "#f1eff9" },
      metric: {
        bossHudH: 40,
        bossNotchH: 6,
        bossGuardGap: 10,
        bossGuardH: 6,
        barH: 14,
        hudPad: 10,
        hudBarW: 320,
        hudAbilityRows: 4,
      },
      space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 40 },
      motion: { finalRewardIn: 0.4 },
    },
  });
}

describe("Ghost production replay world", () => {
  it("propagates observation failure and releases its seek guard without claiming completed advancement", () => {
    const ghost = createGhostV3({
      id: "observation-failure",
      rulesetVersion: "tear-rules-2026.07",
      sourceClassification: "native-v3",
      trident,
      actions: [],
      snapshots: [],
      events: [],
    });
    const created: unknown[] = [],
      source = productionComposition(created);
    let fail = true;
    const replay = new GhostProductionReplayWorld(ghost, {
      create(snapshot: undefined) {
        const session = source.create(snapshot);
        return {
          ...session,
          afterReplayAdvance() {
            if (fail) throw new Error("observation failed");
          },
        };
      },
    });
    expect(() => replay.seek(2)).toThrow(/observation failed/);
    expect(replay.simulation()?.scheduler.tick).toBe(1);
    fail = false;
    expect(replay.seek(2).tick).toBe(2);
    expect(created).toHaveLength(2);
  });
  it("drives the C27A production combat composition through its one supplied runtime", () => {
    const ghost = createGhostV3({
      id: "c29-production-replay",
      rulesetVersion: "tear-rules-2026.07",
      sourceClassification: "native-v3",
      trident,
      actions: [
        { kind: "command", id: 1, tick: 2, command: { type: "move", x: 1_000, y: 0 } },
        { kind: "command", id: 2, tick: 20, command: { type: "jump", phase: "pressed" } },
        { kind: "command", id: 3, tick: 40, command: { type: "dash", x: 1_000, y: 0 } },
      ],
      snapshots: [],
      events: [],
    });
    const created: unknown[] = [];
    const replay = new GhostProductionReplayWorld(ghost, productionComposition(created));

    const first = replay.seek(80);
    const firstRuntime = replay.simulation();
    expect(firstRuntime).toBe(created[0]);
    expect(firstRuntime?.scheduler.tick).toBe(80);
    expect(first.semanticHash).not.toBe("");

    const repeated = replay.seek(80);
    expect(repeated.semanticHash).toBe(first.semanticHash);
    expect(replay.simulation()).toBe(created[1]);
    expect(created).toHaveLength(2);
  });
  it("draws real reconstructed actors at two seeks without changing canonical state or either RNG", () => {
    const calls: string[] = [];
    const canvas = () => recordingCanvas(calls);
    const presentation = replayPresentation(calls);
    const ghost = createGhostV3({
      id: "draw-source",
      rulesetVersion: "test",
      sourceClassification: "native-v3",
      trident,
      actions: [{ kind: "command", id: 1, tick: 1, command: { type: "move", x: 1000, y: 0 } }],
      snapshots: [],
      events: [],
    });
    const headless = new GhostProductionReplayWorld(
      ghost,
      createProductionGhostReplayComposition({ runSeed: scenarioRunSeed("draw-seed") }),
    );
    let owner: ReturnType<ReturnType<typeof createProductionGhostReplayComposition>["create"]> | undefined;
    const composition = createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed("draw-seed"),
      ...presentation,
    });
    const replay = new GhostProductionReplayWorld(ghost, {
      create(snapshot) {
        owner = composition.create(snapshot);
        return owner;
      },
    });
    const frames: string[] = [];
    for (const tick of [120, 240]) {
      const result = replay.seek(tick);
      expect(result.semanticHash).toBe(headless.seek(tick).semanticHash);
      const current = owner;
      if (current === undefined) throw new Error("test replay owner missing");
      const before = JSON.stringify({
        state: projectProductionReplayCanonicalState(current.replay, tick, current.simulation.input),
        random: current.replay.random.service.snapshot(),
        cosmetic: current.replay.cosmeticEmissionRandom.snapshot(),
      });
      const frame = replay.renderView(),
        target = canvas().getContext();
      calls.length = 0;
      frame.draw(target, { x: 0, y: 0, w: 640, h: 360 });
      frame.draw(target, { x: 0, y: 0, w: 640, h: 360 });
      expect(calls.some((call) => call.startsWith("fillRect:"))).toBe(true);
      expect(calls.some((call) => call.startsWith("lineTo:"))).toBe(true);
      expect(frame.tick).toBe(tick);
      expect(frame.camera.policy).toBe("player-follow");
      expect("world" in frame).toBe(false);
      expect(
        JSON.stringify({
          state: projectProductionReplayCanonicalState(current.replay, tick, current.simulation.input),
          random: current.replay.random.service.snapshot(),
          cosmetic: current.replay.cosmeticEmissionRandom.snapshot(),
        }),
      ).toBe(before);
      frames.push(JSON.stringify(calls));
    }
    expect(frames[0]).not.toBe(frames[1]);
  });
  it("skips only environment-drawn enemies without a renderer and refuses any other", () => {
    const calls: string[] = [];
    const ghost = createGhostV3({
      id: "undrawable-enemy",
      rulesetVersion: "test",
      sourceClassification: "native-v3",
      trident,
      actions: [],
      snapshots: [],
      events: [],
    });
    let owner: ReturnType<ReturnType<typeof createProductionGhostReplayComposition>["create"]> | undefined;
    const composition = createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed("draw-seed"),
      ...replayPresentation(calls),
    });
    const replay = new GhostProductionReplayWorld(ghost, {
      create(snapshot) {
        owner = composition.create(snapshot);
        return owner;
      },
    });
    replay.seek(60);
    if (owner === undefined) throw new Error("test replay owner missing");
    const [enemy] = owner.replay.world.state.enemies();
    if (enemy === undefined) throw new Error("test replay has no enemy");
    const target = recordingCanvas(calls).getContext();
    const draw = () => {
      replay.renderView().draw(target, { x: 0, y: 0, w: 640, h: 360 });
    };
    // The real enemy keeps its fields; hiding its draw method makes it an enemy without a renderer.
    Reflect.defineProperty(enemy, "draw", { value: undefined });
    Reflect.set(enemy, "kind", "rootbinder");
    expect(draw).not.toThrow();
    Reflect.set(enemy, "kind", "undrawable-test-kind");
    expect(draw).toThrow("replay enemy renderer is unavailable");
  });
});
