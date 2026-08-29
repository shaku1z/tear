import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { validateProjectedBosses, projectBossReference } from "../../src/game-reference/boss-reference";
import { BOSS_DEFINITIONS, bossPhaseMarks } from "../../src/gameplay/run/boss-definitions";
import { BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import { STAGES } from "../../src/gameplay/stages";
import { createEnemyHarness } from "./enemy-test-harness";
import { createMirrorTestHarness } from "./mirror-test-harness";

const expected = [
  { id: "warden", name: "The Warden", stageId: "grounds", phaseMarks: [0.65, 0.30] },
  { id: "colossus", name: "Iron Colossus", stageId: "undercroft", phaseMarks: [0.60, 0.25] },
  { id: "aldric", name: "Berserker King", stageId: "crimson-fields", phaseMarks: [0.65, 0.20] },
  { id: "rootbound", name: "The Rootbound", stageId: "verdant-sanctum", phaseMarks: [0.65, 0.28] },
  { id: "white-hart", name: "The White Hart", stageId: "pale-traverse", phaseMarks: [0.65, 0.28] },
  { id: "echo", name: "The Echo", stageId: "voidspire", phaseMarks: [0.60, 0.25] },
  { id: "source", name: "The Source", stageId: "tear", phaseMarks: [0.58, 0.28] },
] as const;

describe("authored boss reference", () => {
  it("is the frozen seven-entry identity and phase authority", () => {
    expect(BOSS_DEFINITIONS).toEqual(expected.map(({ id, name, phaseMarks }) => ({ id, name, phaseMarks })));
    expect(Object.isFrozen(BOSS_DEFINITIONS)).toBe(true);
    for (const definition of BOSS_DEFINITIONS) expect(Object.isFrozen(definition.phaseMarks)).toBe(true);
    expect(BOSS_ROSTER).toEqual(expected.map(({ id, name }) => ({ id, name })));
    expect(Object.isFrozen(BOSS_ROSTER)).toBe(true);
    const first = BOSS_ROSTER[0];
    const firstId: "warden" = first.id;
    const firstName: "The Warden" = first.name;
    expect(firstId).toBe("warden");
    expect(firstName).toBe("The Warden");
    expect(Object.keys(first)).toEqual(["id", "name"]);
  });

  it("projects the exact stage bijection and imported shape", () => {
    const result = projectBossReference({ bossDefinitions: BOSS_DEFINITIONS, stages: STAGES });
    expect(result).toEqual(expected);
    expect(result.some((boss) => boss.id === "rootbound")).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0]?.phaseMarks)).toBe(true);
    expect(() => validateProjectedBosses(result, "bosses")).not.toThrow();
  });

  it("rejects reordered authored definitions, broken stage joins, and unsafe imported fields", () => {
    expect(() => projectBossReference({ bossDefinitions: BOSS_DEFINITIONS.slice().reverse(), stages: STAGES })).toThrow(/exact canonical authored order/u);

    const brokenStages = STAGES.map((stage, index) => index === 0 ? { ...stage, boss: "source" as const } : stage);
    expect(() => projectBossReference({ bossDefinitions: BOSS_DEFINITIONS, stages: brokenStages })).toThrow(/canonical stage mapping/u);

    const malformed = structuredClone(projectBossReference({ bossDefinitions: BOSS_DEFINITIONS, stages: STAGES })) as unknown as Record<string, unknown>[];
    const first = malformed[0];
    if (first === undefined) throw new Error("missing boss fixture");
    first.extra = true;
    expect(() => validateProjectedBosses(malformed, "bosses")).toThrow(/unexpected or missing fields/u);

    const badMarks = structuredClone(projectBossReference({ bossDefinitions: BOSS_DEFINITIONS, stages: STAGES })) as unknown as Record<string, unknown>[];
    const source = badMarks.at(-1);
    if (source === undefined) throw new Error("missing source fixture");
    source.phaseMarks = [0.2, 0.3];
    expect(() => validateProjectedBosses(badMarks, "bosses")).toThrow(/descending marks/u);
  });

  it("keeps runtime constructors and threshold config on the same phase authority", () => {
    const harness = createEnemyHarness([0.2, 0.7, 0.4]);
    const constructors = {
      warden: harness.types.Warden,
      colossus: harness.types.Colossus,
      aldric: harness.types.Aldric,
      rootbound: harness.types.Rootbound,
      "white-hart": harness.types.WhiteHart,
      echo: harness.types.Echo,
      source: harness.types.Source,
    } as const;
    for (const definition of BOSS_DEFINITIONS) {
      const Boss = constructors[definition.id];
      const boss = new Boss(CONFIG.view.w / 2, CONFIG.world.groundY - 180) as unknown as { phaseMarks: number[] };
      expect(boss.phaseMarks, definition.id).toEqual([...definition.phaseMarks]);
    }

    const { host } = createMirrorTestHarness();
    expect(host.phaseMarks).toEqual([...bossPhaseMarks("echo")]);
    expect(CONFIG.aldric.fireTier).toBe(bossPhaseMarks("aldric")[0]);
    expect(CONFIG.aldric.fakeTier).toBe(bossPhaseMarks("aldric")[1]);
    expect(CONFIG.source.voidTier).toBe(bossPhaseMarks("source")[0]);
    expect(CONFIG.source.fakeTier).toBe(bossPhaseMarks("source")[1]);
    expect({ fireTier: CONFIG.aldric.fireTier, fakeTier: CONFIG.aldric.fakeTier }).toEqual({ fireTier: 0.65, fakeTier: 0.20 });
    expect({ voidTier: CONFIG.source.voidTier, fakeTier: CONFIG.source.fakeTier }).toEqual({ voidTier: 0.58, fakeTier: 0.28 });
  });
});
