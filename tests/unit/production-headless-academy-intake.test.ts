import { describe, expect, it } from "vitest";

import {
  ProductionHeadlessAcademyIntake,
  createProductionHeadlessEpisodePool,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(id: string): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C30 bounded Academy candidate handoff",
    stateClass: "recorded-canonical", executionClass: "training",
    seed: `c30-academy-intake-${id}`,
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
    maxTicks: 2, assertions: Object.freeze(["runtime.finite-state"] as const),
    tags: Object.freeze(["c30", "academy-intake"] as const),
  });
}

async function runTerminal(pool: ReturnType<typeof createProductionHeadlessEpisodePool>, intake: ProductionHeadlessAcademyIntake, id: string) {
  const receipts = [] as ReturnType<ProductionHeadlessAcademyIntake["offer"]>[];
  const results = await pool.run([Object.freeze({ id, scenario: scenario(id), maxTicks: 2 })], () => Object.freeze({
    decide: () => Object.freeze([Object.freeze([])]),
  }), {
    batchSize: 1,
    artifactConsumer: (sample) => { receipts.push(intake.offer(sample)); },
  });
  return Object.freeze({ results, receipts });
}

describe("C30 production headless Academy intake", () => {
  it("accepts real terminal artifacts only up to capacity and reports backpressure without stopping production episodes", async () => {
    const intake = new ProductionHeadlessAcademyIntake(1);
    const pool = createProductionHeadlessEpisodePool(1);

    const first = await runTerminal(pool, intake, "academy-first");
    const second = await runTerminal(pool, intake, "academy-second");
    expect(first.results).toMatchObject([{ outcome: "truncated", ticks: 2 }]);
    expect(second.results).toMatchObject([{ outcome: "truncated", ticks: 2 }]);
    expect(first.receipts).toMatchObject([{ kind: "accepted", queued: 1, capacity: 1, sequence: 1 }]);
    expect(second.receipts).toMatchObject([{ kind: "backpressured", queued: 1, capacity: 1 }]);
    expect(intake.snapshot()).toEqual({
      capacity: 1, queued: 1, accepted: 1, backpressured: 1, closed: 0, isClosed: false,
    });

    const candidate = intake.take();
    expect(candidate).toHaveLength(1);
    expect(candidate[0]).toMatchObject({
      episodeId: "academy-first", tick: 2,
      artifact: { format: "tearbench-production-headless-terminal", scenario: { id: "academy-first" } },
    });

    const third = await runTerminal(pool, intake, "academy-third");
    expect(third.receipts).toMatchObject([{ kind: "accepted", sequence: 2, queued: 1 }]);
    intake.close();
    const closed = await runTerminal(pool, intake, "academy-closed");
    expect(closed.results).toMatchObject([{ outcome: "truncated", ticks: 2 }]);
    expect(closed.receipts).toMatchObject([{ kind: "closed", queued: 1, capacity: 1 }]);
    expect(intake.snapshot()).toEqual({
      capacity: 1, queued: 1, accepted: 2, backpressured: 1, closed: 1, isClosed: true,
    });
  });

  it("fails closed for an artifact that is not a production terminal", () => {
    const intake = new ProductionHeadlessAcademyIntake(1);
    expect(() => intake.offer({ episodeId: "invalid", tick: 1, artifact: { format: "not-terminal" } })).toThrow(
      /production terminal/u,
    );
  });
});
