const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

const scenario = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "tutorial.complete-with-player-actions",
  version: 1,
  description: "Complete every tutorial lesson through live, player-valid actions",
  stateClass: "recorded-canonical",
  executionClass: "engineering",
  seed: "tutorial-parity",
  start: { mode: "tutorial", difficulty: "normal", weapon: "sword" },
  // The prior course used 11,970 ticks. Two-wave transfer adds a 150-tick
  // breath plus real launch/follow-up/projectile actions, with finite retries.
  maxTicks: 16_000,
  assertions: ["runtime.finite-state", "player.finite-transform", "blade.finite-transform"],
  tags: ["tutorial", "parity", "full-journey"],
};

withJourney({ name: "tutorial full journey", port: 4187, deferBoot: true }, async ({ page, boot }) => {
  try {
    await page.addInitScript(() => {
      // Observation-only sentinel: no profile, currency, achievement or course state is seeded.
      const sentinel = "tutorial-coach-backing-observer";
      window.__TEAR_TEST_STORAGE__ = { [sentinel]: "observe-existing-map" };
      const NativeMap = window.Map;
      window.Map = new Proxy(NativeMap, {
        construct(target, args, newTarget) {
          try {
            const map = Reflect.construct(target, args, newTarget);
            if (map.get(sentinel) === "observe-existing-map") {
              window.__TUTORIAL_COACH_STORAGE__ = map;
              window.Map = NativeMap;
            }
            return map;
          } catch (error) {
            window.Map = NativeMap;
            throw error;
          }
        },
      });
      const text = [],
        original = CanvasRenderingContext2D.prototype.fillText;
      window.__TUTORIAL_COACH_TEXT__ = text;
      CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...rest) {
        text.push({ text: String(value), x, y });
        if (text.length > 2000) text.splice(0, 1000);
        return original.call(this, value, x, y, ...rest);
      };
    });
    await boot();
    await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__PANTHEON_TEST, undefined, {
      timeout: STATE_WAIT_MS,
    });
    // Use the same async preflight as the real Play menu before taking exact-tick control.
    await page.evaluate(() => window.__PANTHEON_TEST.startMode("tutorial", "normal"));
    await page.waitForFunction(
      () => window.__PANTHEON_TEST.state().game === "playing" && window.__PANTHEON_TEST.tutorial().active,
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    const driverSource = require("typescript").transpileModule(
      fs.readFileSync(path.join(__dirname, "../src/tearbench/tutorial-course-driver.ts"), "utf8"),
      {
        compilerOptions: {
          target: require("typescript").ScriptTarget.ES2022,
          module: require("typescript").ModuleKind.ESNext,
        },
      },
    ).outputText;
    await page.addScriptTag({
      type: "module",
      content: `${driverSource}\nglobalThis.__TEAR_TUTORIAL_COURSE_DRIVER__ = driveTutorialCourse; globalThis.__TEAR_TUTORIAL_LESSON_DRIVER__ = driveTutorialLesson;`,
    });
    const result = await page.evaluate(
      ({ scenarioValue, captureContinuation }) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        // Preserve the real preflight-issued course, including its durable receipt.
        // Reset establishes Class A control; restore adopts the untouched live origin.
        const origin = environment.captureSnapshot("tutorial-issued-live-origin", "recorded-canonical");
        const actualScenario = { ...scenarioValue, seed: origin.seed };
        environment.reset(actualScenario);
        const restored = environment.restoreSnapshot(origin);
        if (!restored.ok) throw new Error(`Issued tutorial origin restore refused: ${JSON.stringify(restored)}`);
        window.__tutorialJourneyEnvironment = environment;
        window.__tutorialJourneyCommandId = 0;
        return window.__TEAR_TUTORIAL_COURSE_DRIVER__(
          {
            environment,
            nextCommandId: () => ++window.__tutorialJourneyCommandId,
            tutorial: () => window.__PANTHEON_TEST.tutorial(),
            state: () => window.__PANTHEON_TEST.state(),
          },
          { scenarioValue: actualScenario, captureContinuation },
        );
      },
      { scenarioValue: scenario, captureContinuation: Boolean(process.env.TEAR_TUTORIAL_CONTINUATION_TRACE) },
    );

    const last = result.trace.at(-1);
    assert.equal(result.reachedReady, true, `tutorial did not reach READY: ${JSON.stringify(last)}`);
    if (process.env.TEAR_TUTORIAL_CONTINUATION_TRACE) {
      assert.ok(
        result.continuationTrace?.hashes.length > 0,
        "Field Test continuation trace must include actual authoritative ticks",
      );
      const target = path.resolve(process.env.TEAR_TUTORIAL_CONTINUATION_TRACE);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(result.continuationTrace, null, 2)}\n`);
    }
    assert.equal(result.active, false, `tutorial remained active: ${JSON.stringify(last)}`);
    // The terminal canonical receipt belongs to the completed tutorial; its host handoff commits afterward.
    await page.waitForFunction(
      () => window.__PANTHEON_TEST.state().mode === "playground" && window.__PANTHEON_TEST.state().game === "paused",
    );
    const handoff = await page.evaluate(() => window.__PANTHEON_TEST.state());
    assert.equal(handoff.mode, "playground", `tutorial did not hand off to practice: ${JSON.stringify(last)}`);
    assert.equal(handoff.game, "paused", `completion did not open its technique summary: ${JSON.stringify(last)}`);
    assert.ok(result.metrics.acceptedActions > 0, "journey must use player-valid actions");
    assert.ok(
      result.metrics.fixedTicks <= scenario.maxTicks,
      "tutorial journey must remain within its declared tick limit",
    );
    const launchEntry = result.trace.find((entry) => entry.label === "after-3");
    const powerSlamEntry = result.trace.find((entry) => entry.label === "after-6");
    assert.equal(launchEntry?.lesson, "LAUNCH", "journey must reach the launch lesson");
    assert.equal(launchEntry?.counters?.launch ?? 0, 0, "launch must not inherit an earlier upward cut");
    assert.equal(powerSlamEntry?.lesson, "POWER SLAM", "journey must reach the power-slam lesson");
    assert.equal(powerSlamEntry?.counters?.superslam ?? 0, 0, "power slam must not inherit the slam lesson");
    assert.deepEqual(
      [...new Set(result.trace.map((entry) => entry.arena))],
      [
        "runway",
        "vertical-gate",
        "dash-lane",
        "blade-range",
        "launch-bay",
        "air-chain",
        "drop-well",
        "dive-channel",
        "liftwell",
        "throw-lane",
        "counterline",
        "read-line",
        "field-floor",
        "ready-room",
      ],
      "every tutorial block must install its own arena",
    );
    // Select the actual rendered completed LAUNCH control in this same course.
    // Class A stopped the browser loop; advance its application frame to consume
    // the physical click through the normal UI owner.
    await page.mouse.click(830, 285); // LAUNCH: third row, left column of the reached-lessons panel
    await page.evaluate(() => window.__tutorialJourneyEnvironment.advanceApplicationFrame(1 / 120));
    await page.waitForFunction(
      () =>
        window.__PANTHEON_TEST.state().mode === "tutorial" &&
        window.__PANTHEON_TEST.tutorial().active &&
        window.__PANTHEON_TEST.tutorial().lessonIndex === 4,
    );
    const practice = await page.evaluate(() => window.__PANTHEON_TEST.tutorial());
    assert.equal(
      practice.arena,
      "launch-bay",
      "completed LAUNCH selection must install its own arena after the new-run boundary",
    );
    assert.deepEqual(
      await page.evaluate(() =>
        window.__tutorialJourneyEnvironment
          .observe()
          .navigation.surfaces.map((surface) => surface.id)
          .sort(),
      ),
      ["tutorial:launch-bay:0", "tutorial:launch-bay:floor"],
      "selected lesson must own the physical collision surfaces",
    );
    assert.equal(practice.session.phase, "lesson-practice");
    assert.equal(practice.session.courseCompleted, true, "practice must retain the course completion guard");
    const appFrame = () => page.evaluate(() => window.__tutorialJourneyEnvironment.advanceApplicationFrame(1 / 120));
    const clickLabel = async (label) => {
      // Class A owns rendering too; async menu transitions can settle after the prior frame.
      await page.evaluate(() => {
        window.__TUTORIAL_COACH_TEXT__.length = 0;
      });
      await appFrame();
      await page.waitForFunction((expected) => {
        if (window.__TUTORIAL_COACH_TEXT__.some((entry) => entry.text === expected)) return true;
        if (window.__PANTHEON_TEST.state().game === "playing")
          throw new Error(`UI control ${expected} requested during gameplay`);
        window.__tutorialJourneyEnvironment.advanceApplicationFrame(1 / 120);
        return false;
      }, label);
      const point = await page.evaluate(
        (expected) => window.__TUTORIAL_COACH_TEXT__.findLast((entry) => entry.text === expected),
        label,
      );
      await page.evaluate(() => {
        window.__TUTORIAL_COACH_TEXT__.length = 0;
      });
      await page.mouse.click(point.x, point.y);
      await appFrame();
      await page.evaluate(
        ({ label, point }) => {
          const session = window.__PANTHEON_TEST.tutorial().session;
          (window.__TUTORIAL_COACH_CLICKS__ ??= []).push({
            label,
            point,
            screen: window.__PANTHEON_TEST.state().game,
            coach: session.coach,
            helpVisible: session.helpVisible,
          });
        },
        { label, point },
      );
    };
    const pause = async () => {
      await page.keyboard.press("p");
      await appFrame();
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
    };
    const pump = (ticks) =>
      page.evaluate((count) => {
        for (let tick = 0; tick < count; tick++) window.__tutorialJourneyEnvironment.step([]);
      }, ticks);
    const coach = () => page.evaluate(() => window.__PANTHEON_TEST.tutorial().session.coach);
    const effects = () =>
      page.evaluate(() => {
        const storage = window.__TUTORIAL_COACH_STORAGE__;
        if (storage?.get("tutorial-coach-backing-observer") !== "observe-existing-map")
          throw new Error("Actual tutorial backing map was not observed");
        const raw = storage.get("tear_profile_v2"),
          metaRaw = storage.get("tear_meta");
        if (!raw || !metaRaw) throw new Error("Completed tutorial must retain its real profile/META storage");
        const profile = JSON.parse(raw).profile;
        return {
          stats: profile.stats,
          ach: profile.ach,
          seen: profile.seen,
          modes: profile.modes,
          meta: JSON.parse(metaRaw),
          cinematic: Object.fromEntries(
            Object.entries(localStorage).filter(([key]) => key.startsWith("tear.cinematic.")),
          ),
        };
      });
    const directory = process.env.TEAR_TUTORIAL_GHOST_ARTIFACT_DIR;
    if (directory) fs.mkdirSync(path.resolve(directory), { recursive: true });
    await pause();
    const objectiveBefore = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().counters);
    const savedBeforeDemo = await effects();
    await clickLabel("SHOW DEMO");
    const preview = await coach();
    assert.equal(preview.mode, "preview");
    assert.equal(preview.visible, true);
    await pump(6);
    assert.equal(
      (await coach()).visible,
      true,
      "resuming from a rendered UI click must not become a gameplay swing/dismissal",
    );
    await pump(Math.ceil((preview.toTick - preview.fromTick) / preview.rate) + 2);
    assert.equal((await coach()).visible, false, "explicit demo must end rather than loop");
    assert.deepEqual(
      await page.evaluate(() => window.__PANTHEON_TEST.tutorial().counters),
      objectiveBefore,
      "watching gold must not produce objective evidence",
    );
    assert.deepEqual(await effects(), savedBeforeDemo, "watching gold must not change saved effects");
    await pause();
    await clickLabel("SHOW DEMO");
    await page.evaluate(() => {
      const env = window.__tutorialJourneyEnvironment,
        tick = env.observe().tick + 1;
      env.step([
        { kind: "command", id: ++window.__tutorialJourneyCommandId, tick, command: { type: "move", x: 1000, y: 0 } },
      ]);
      env.step([
        {
          kind: "command",
          id: ++window.__tutorialJourneyCommandId,
          tick: tick + 1,
          command: { type: "move", x: 0, y: 0 },
        },
      ]);
    });
    assert.equal((await coach()).visible, false, "meaningful real player movement must dismiss preview");
    await pause();
    await clickLabel("DEMO SPEED 1×");
    await clickLabel("SHOW DEMO");
    const slowDemo = await coach();
    await pump(20);
    assert.equal((await coach()).mode, "preview");
    assert.equal((await coach()).rate, 0.5);
    assert.equal((await coach()).tick - slowDemo.tick, 10, "half-speed changes only the display cursor");
    assert.doesNotMatch((await coach()).diagnosis, /cause unknown|objective/i, "coach copy is player wording");
    if (directory) await page.screenshot({ path: path.join(path.resolve(directory), "tutorial-gold-diagnostic.png") });
    await pause();
    await clickLabel("MAIN MENU");
    await clickLabel("QUIT");
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "menu");
    // Genuine completion above unlocks the normal Lab entry. No profile fixture or lesson marks are installed.
    await clickLabel("PRACTICE LAB");
    await clickLabel("MOVE");
    await page.waitForFunction(
      () => window.__PANTHEON_TEST.tutorial().active && window.__PANTHEON_TEST.tutorial().lessonIndex === 0,
    );
    const beforeAttempt = await effects();
    await page.evaluate(
      (scenarioValue) =>
        window.__TEAR_TUTORIAL_LESSON_DRIVER__(
          {
            environment: window.__tutorialJourneyEnvironment,
            nextCommandId: () => ++window.__tutorialJourneyCommandId,
            tutorial: () => window.__PANTHEON_TEST.tutorial(),
            state: () => window.__PANTHEON_TEST.state(),
          },
          0,
          scenarioValue,
        ),
      scenario,
    );
    assert.equal((await coach()).canCompare, true, "only a genuinely valid Lab attempt enables comparison");
    assert.deepEqual(await effects(), beforeAttempt, "valid Lab practice must not award profile/currency effects");
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
    await clickLabel("SETTINGS");
    await clickLabel("ACCESS");
    await page.waitForFunction(() =>
      window.__TUTORIAL_COACH_TEXT__.some((entry) => entry.text === "Reduced camera motion"),
    );
    const reducedRow = await page.evaluate(() =>
      window.__TUTORIAL_COACH_TEXT__.findLast((entry) => entry.text === "Reduced camera motion"),
    );
    await page.mouse.click(1173, reducedRow.y - 3);
    await appFrame();
    await clickLabel("‹  BACK");
    assert.equal((await coach()).reducedMotion, true);
    const objectiveBeforeCompare = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().counters);
    await clickLabel("COMPARE WITH DEMO");
    await pump(20);
    assert.equal((await coach()).mode, "comparison");
    assert.equal((await coach()).visible, true);
    assert.deepEqual(await page.evaluate(() => window.__PANTHEON_TEST.tutorial().counters), objectiveBeforeCompare);
    assert.deepEqual(await effects(), beforeAttempt);
    if (directory)
      await page.screenshot({
        path: path.join(path.resolve(directory), "tutorial-gold-comparison-reduced-motion.png"),
      });
    // Keep the ordinary full-course acceptance above intact. Start a separate genuinely issued
    // course to exercise rendered Skip/unfinished summary and Assist without forged marks/counts.
    await pause();
    await clickLabel("MAIN MENU");
    await clickLabel("QUIT");
    await page.evaluate(() => window.__PANTHEON_TEST.startMode("tutorial", "normal"));
    await page.waitForFunction(
      () => window.__PANTHEON_TEST.state().game === "playing" && window.__PANTHEON_TEST.tutorial().active,
    );
    await page.evaluate((scenarioValue) => {
      const environment = window.__tutorialJourneyEnvironment;
      const origin = environment.captureSnapshot("adaptive-issued-origin", "recorded-canonical");
      environment.reset({ ...scenarioValue, seed: origin.seed });
      const restored = environment.restoreSnapshot(origin);
      if (!restored.ok) throw new Error(JSON.stringify(restored));
      window.__tutorialJourneyCommandId = 0;
    }, scenario);
    const beforeUnearned = await effects();
    for (let lesson = 0; lesson < 13; lesson++) {
      assert.equal((await page.evaluate(() => window.__PANTHEON_TEST.tutorial())).lessonIndex, lesson);
      await pause();
      await clickLabel("SKIP LESSON");
    }
    await page.evaluate((maximumTicks) => {
      let ticks = 0;
      while (window.__PANTHEON_TEST.tutorial().active && ticks < maximumTicks) {
        window.__tutorialJourneyEnvironment.step([]);
        ticks++;
      }
      if (window.__PANTHEON_TEST.tutorial().active)
        throw new Error("Unfinished READY exceeded its declared handoff limit");
    }, 210);
    await page.waitForFunction(
      () => window.__PANTHEON_TEST.state().mode === "playground" && window.__PANTHEON_TEST.state().game === "paused",
    );
    const unfinished = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
    assert.equal(unfinished.unfinished, true);
    assert.equal(unfinished.courseCompleted, false);
    assert.equal(unfinished.skipped.length, 13);
    assert.deepEqual(
      await effects(),
      beforeUnearned,
      "skipped READY cannot award profile completion or Apprentice coins",
    );
    if (directory)
      await page.screenshot({ path: path.join(path.resolve(directory), "tutorial-unfinished-summary.png") });
    await page.evaluate(() => {
      const environment = window.__tutorialJourneyEnvironment;
      const saved = environment.captureSnapshot("adaptive-unearned-summary", "recorded-canonical");
      const restored = environment.restoreSnapshot(JSON.parse(JSON.stringify(saved)));
      if (!restored.ok) throw new Error(JSON.stringify(restored));
    });
    await clickLabel("SLAM · SKIPPED");
    await pump(900);
    assert.equal((await coach()).adaptive.failures, 0, "idle cannot escalate coaching");
    const ladder = await page.evaluate(() => {
      const environment = window.__tutorialJourneyEnvironment,
        seen = new Set();
      let demo = false;
      const step = (command) => {
        const tick = environment.observe().tick + 1;
        environment.step(command ? [{ kind: "command", id: ++window.__tutorialJourneyCommandId, tick, command }] : []);
        const coach = window.__PANTHEON_TEST.tutorial().session.coach;
        seen.add(coach.adaptive.failures);
        if (coach.adaptive.failures === 4 && coach.mode === "diagnostic" && coach.visible) demo = true;
      };
      for (
        let attempt = 0;
        attempt < 16 && !window.__PANTHEON_TEST.tutorial().session.coach.adaptive.assistOffered;
        attempt++
      ) {
        step({ type: "aim", turn: attempt % 2 ? 375000 : 625000, magnitude: 1000 });
        for (let tick = 0; tick < 100; tick++) step();
      }
      return { seen: [...seen], demo, coach: window.__PANTHEON_TEST.tutorial().session.coach };
    });
    assert.ok([2, 4, 6].every((count) => ladder.seen.includes(count)));
    assert.equal(ladder.demo, true);
    assert.equal(ladder.coach.adaptive.assistOffered, true);
    await pause();
    if (directory) await page.screenshot({ path: path.join(path.resolve(directory), "tutorial-adaptive-assist.png") });
    await clickLabel("SKIP LESSON");
    const assisted = await page.evaluate(() => window.__PANTHEON_TEST.tutorial());
    assert.equal(assisted.lessonIndex, 7);
    assert.equal(assisted.session.courseCompleted, false);
    assert.ok(assisted.session.skipped.includes("slam"));
    assert.deepEqual(
      await effects(),
      beforeUnearned,
      "explicit checkpoint assist retains unearned work without reward",
    );
    if (directory)
      fs.writeFileSync(
        path.join(path.resolve(directory), "tutorial-adaptive.json"),
        JSON.stringify({ unfinished, ladder, assisted }, null, 2),
      );
    await page.evaluate(() => {
      delete window.__tutorialJourneyEnvironment;
    });
    console.log(`Tutorial journey passed in ${result.metrics.fixedTicks} fixed ticks`);
  } catch (error) {
    const directory = process.env.TEAR_TUTORIAL_GHOST_ARTIFACT_DIR;
    if (directory) {
      fs.mkdirSync(path.resolve(directory), { recursive: true });
      const state = await page
        .evaluate(() => ({
          game: window.__PANTHEON_TEST?.state(),
          tutorial: window.__PANTHEON_TEST?.tutorial(),
          labels: window.__TUTORIAL_COACH_TEXT__?.slice(-50),
          clicks: window.__TUTORIAL_COACH_CLICKS__,
        }))
        .catch(() => null);
      fs.writeFileSync(
        path.join(path.resolve(directory), "failure.json"),
        JSON.stringify({ error: String(error), state }, null, 2),
      );
      await page.screenshot({ path: path.join(path.resolve(directory), "failure.png") }).catch(() => undefined);
    }
    throw error;
  }
});
