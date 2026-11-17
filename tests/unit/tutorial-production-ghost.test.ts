import { readFileSync, writeFileSync } from "node:fs";
import { tutorialGoldSourceFingerprint, assertTutorialGoldFresh } from "../../scripts/tutorial-gold-compatibility.mjs";
import {
  generateTutorialGold,
  verifyTutorialGoldReference,
  type TutorialGoldProof,
} from "../../src/tearbench/tutorial-gold-generation";
import {
  bindTutorialGoldCorpus,
  loadTutorialGoldCorpus,
  packTutorialGoldCorpus,
  sampleTutorialGold,
  type TutorialGoldBinding,
  type TutorialGoldCorpus,
} from "../../src/gameplay/training/tutorial-gold-reference";
import { beforeAll, describe, expect, it } from "vitest";
import { createProductionReplayRun, createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { stableVerificationHash } from "../../src/domain/hash";
import { CONFIG } from "../../src/config/game-config";
import { productionGhostPath, recordProductionGhostTrace } from "../../src/gameplay/training/tutorial-production-ghost";
import {
  TutorialGhostCoach,
  parseTutorialCoachCheckpoint,
  shippingTutorialGold,
} from "../../src/gameplay/training/tutorial-ghost-coach";
import { loadShippingTutorialGold } from "../../src/gameplay/training/tutorial-gold-shipping";

// The shipped corpus is an on-demand asset; training preflight loads it before any lesson.
beforeAll(async () => {
  await loadShippingTutorialGold();
});

describe("gold coach presentation", () => {
  it("uses a brief real successful segment, finite display clocks and meaningful actions without pointer-drift credit", () => {
    const corpus = shippingTutorialGold();
    if (!corpus) throw new Error("Gold fixture missing");
    const coach = new TutorialGhostCoach(() => corpus, CONFIG.blade.minHitSpeed);
    coach.select("slam", 2);
    expect(coach.play("preview")).toBe(true);
    const view = coach.view(false, true);
    expect(view.toTick - view.fromTick).toBeLessThan(1200);
    const ref = corpus.references.find((entry) => entry.lessonId === "slam");
    if (!ref?.frames[0]) throw new Error("Slam reference missing");
    const frame = ref.frames[0],
      input = { tick: 0, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false };
    coach.captureCommands([{ type: "aim", turn: 1 }]);
    coach.observe(frame, input, false);
    expect(coach.view(false, false).visible).toBe(true);
    coach.setRate(0.5);
    const before = coach.view(false, false).tick;
    coach.observe(frame, input, false);
    coach.observe(frame, input, false);
    expect(coach.view(false, false).tick).toBe(before + 1);
    coach.captureCommands([{ type: "dash", x: 1000, y: 0 }]);
    coach.observe({ ...frame, tick: 10000 }, input, true);
    expect(coach.view(true, false)).toMatchObject({ visible: false, canCompare: true }); // Valid on the first action.
    const saved = coach.capture();
    expect(parseTutorialCoachCheckpoint(saved)).toEqual(saved);
    expect(JSON.stringify(saved).length).toBeLessThan(24000);
    expect(JSON.stringify(saved)).not.toContain("compatibility");
    coach.restart();
    expect(coach.play("comparison")).toBe(true);
    for (let tick = 0; tick < 2400; tick++) coach.observe(frame, input, false, false);
    expect(coach.view(true, true).visible).toBe(false);
  });
  it("aborts partial recording on restore instead of reusing the old absolute clock", () => {
    const coach = new TutorialGhostCoach();
    coach.select("move", 2);
    const frame = shippingTutorialGold()?.references.find((entry) => entry.lessonId === "move")?.frames[0];
    if (!frame) throw new Error("Move reference missing");
    const input = { tick: 9000, moveX: 1, moveY: 0, aimTurn: 0, primaryHeld: false };
    coach.observe({ ...frame, tick: 9000 }, input, false);
    const saved = coach.capture();
    expect(saved?.current).toBeUndefined();
    coach.restore(saved);
    coach.observe({ ...frame, tick: 12000 }, input, true);
    expect(coach.capture()?.best).toBeUndefined(); // A partial restored objective cannot become a fresh full attempt.
    coach.restart();
    coach.observe({ ...frame, tick: 13000 }, input, true);
    expect(coach.capture()?.best?.duration).toBe(0);
  });
});

describe("tutorial production ghost traces", () => {
  it("samples the real Player physics deterministically", () => {
    const events = [
      { at: 0, duration: 0.6, right: true },
      { at: 0.2, jump: true },
    ] as const;
    expect(recordProductionGhostTrace(CONFIG, 1.4, events)).toEqual(recordProductionGhostTrace(CONFIG, 1.4, events));
  });

  it("uses the runtime jump and dash model rather than an eased actor path", () => {
    const jump = productionGhostPath(CONFIG, "JUMP", 3);
    const dash = productionGhostPath(CONFIG, "DASH", 3);
    expect(Math.min(...jump.map((frame) => frame[2]))).toBeLessThan(-100);
    const dashPeakSpeed = Math.max(
      ...dash.slice(1).map((frame, index) => {
        const previous = dash[index];
        return previous === undefined ? 0 : Math.abs(frame[1] - previous[1]) / (frame[0] - previous[0]);
      }),
    );
    expect(dashPeakSpeed).toBeGreaterThan(CONFIG.player.moveSpeed);
  });
});

describe("verified tutorial gold corpus", () => {
  it("replays all thirteen current blocks and the genuine legacy Field Test through production physics", () => {
    const fresh = createProductionReplayRun("tutorial");
    expect([fresh.combo, fresh.comboTimer, fresh.mult]).toEqual([0, 0, 1]);
    expect([fresh.rank, fresh.lastTrick]).toEqual(["", ""]);
    const sourceHash = tutorialGoldSourceFingerprint().sourceHash;
    const shippingPath = "src/gameplay/training/tutorial-gold-reference-data.json",
      proofPath = "tests/fixtures/tutorial-gold-reference-proof.json";
    const bindingPath = "src/gameplay/training/tutorial-gold-binding.json";
    let rawCorpus: unknown,
      expectedCorpus: TutorialGoldCorpus | undefined,
      proof: TutorialGoldProof,
      binding: TutorialGoldBinding;
    if (process.env.TEAR_TUTORIAL_GOLD_WRITE === "1") {
      const generated = generateTutorialGold(sourceHash);
      expectedCorpus = generated.corpus;
      rawCorpus = packTutorialGoldCorpus(generated.corpus);
      proof = generated.proof;
      binding = generated.binding;
    } else {
      rawCorpus = JSON.parse(readFileSync(shippingPath, "utf8")) as unknown;
      proof = JSON.parse(readFileSync(proofPath, "utf8")) as TutorialGoldProof;
      binding = JSON.parse(readFileSync(bindingPath, "utf8")) as TutorialGoldBinding;
    }
    const loadStarted = performance.now();
    const loaded = loadTutorialGoldCorpus(rawCorpus, binding, sourceHash);
    expect(loaded.status).toBe("ready");
    if (loaded.status !== "ready") throw new Error("Gold shipping decode refused");
    const corpus = loaded.corpus;
    const loadMilliseconds = performance.now() - loadStarted;
    if (expectedCorpus !== undefined) expect(corpus).toEqual(expectedCorpus);
    expect(bindTutorialGoldCorpus(corpus, sourceHash)).toEqual(binding);
    const roundTrip = loadTutorialGoldCorpus(packTutorialGoldCorpus(corpus), binding, sourceHash);
    if (roundTrip.status !== "ready") throw new Error("Packed gold round trip refused");
    expect(roundTrip.corpus).toEqual(corpus);
    const incompatible = { status: "unavailable", reason: "incompatible" };
    expect(loadTutorialGoldCorpus(rawCorpus, binding, "0".repeat(64))).toEqual(incompatible);
    expect(loadTutorialGoldCorpus(rawCorpus, { ...binding, corpusContentHash: "0".repeat(16) }, sourceHash)).toEqual(
      incompatible,
    );
    expect(corpus.references).toHaveLength(14);
    expect(corpus.compatibility.configurationHash).toBe(
      stableVerificationHash(
        createProductionReplayWorld({
          seed: "gold-baseline",
          mode: "tutorial",
          weaponId: "sword",
          difficulty: "normal",
        }).configuration.value,
      ),
    );
    for (const reference of corpus.references) {
      const evidence = proof.references.find(
        (item) => item.lessonId === reference.lessonId && item.curriculumVersion === reference.curriculumVersion,
      );
      if (evidence === undefined) throw new Error("Missing actual gold proof");
      expect(
        (evidence.origin.state["tear.ui.v1"] as { tutorialPresentation?: { goldCoach?: unknown } }).tutorialPresentation
          ?.goldCoach,
      ).toBeUndefined();
      verifyTutorialGoldReference(reference, evidence);
      expect(sampleTutorialGold(reference, reference.durationTicks / 120).finished).toBe(true);
      expect(sampleTutorialGold(reference, reference.durationTicks / 120, 0.5).finished).toBe(false);
    }
    const cut = corpus.references.find((reference) => reference.lessonId === "cut");
    expect(cut?.durationTicks).toBeGreaterThan(485); // Retains the fourth real saved-origin contact regression.
    for (const lesson of ["cut", "launch", "juggle", "throw"])
      expect(
        corpus.references
          .find((reference) => reference.lessonId === lesson)
          ?.landmarks.some((landmark) => landmark.kind === "contact"),
      ).toBe(true);
    const field = corpus.references.find(
      (reference) => reference.lessonId === "field-test" && reference.curriculumVersion === 2,
    );
    expect(new Set(field?.frames.map((frame) => frame.encounter))).toEqual(new Set(["charger", "breath", "mixed"]));
    if (process.env.TEAR_TUTORIAL_GOLD_WRITE === "1") {
      // A source-only change rewrites just the binding; the corpus and proof change only with the gold output.
      writeFileSync(shippingPath, JSON.stringify(rawCorpus) + "\n");
      writeFileSync(proofPath, JSON.stringify(proof) + "\n");
      writeFileSync(bindingPath, JSON.stringify(binding, null, 2) + "\n");
    }
    expect(assertTutorialGoldFresh()).toBe(sourceHash);
    process.stdout.write(
      `Gold packed ${String(Buffer.byteLength(JSON.stringify(rawCorpus)))} bytes, decoded ${String(Buffer.byteLength(JSON.stringify(corpus)))} bytes; proof ${String(Buffer.byteLength(JSON.stringify(proof)))} bytes; detached hash/validation/freeze load ${String(loadMilliseconds)}ms; all 14 replayed\n`,
    );
  }, 120000);
});
