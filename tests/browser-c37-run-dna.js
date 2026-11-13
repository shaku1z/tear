const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { withJourney } = require("./browser-journey-harness");

// One real native recording; reading and navigation use ordinary durable storage.
withJourney(
  { name: "C37 recorded Run DNA", port: 8155, deferBoot: true, ordinaryWatch: true },
  async ({ page, boot, waitScreen, buildInfo }) => {
    const directory = process.env.TEAR_RUN_DNA_ARTIFACT_DIR;
    if (directory) await mkdir(directory, { recursive: true });
    await page.addInitScript(() => {
      const positions = [],
        texts = [],
        original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
        const label = String(text);
        if (label === "PROFILE" || (rest[1] < 80 && ["\u25c6 THEATER", "\u25b6 REPLAY"].includes(label)))
          positions.length = 0;
        positions.push({
          text: label,
          x: rest[0],
          y: rest[1],
          align: this.textAlign,
          width: this.measureText(label).width,
        });
        texts.push(label);
        if (texts.length > 20000) texts.splice(0, 10000);
        return original.call(this, text, ...rest);
      };
      window.__DNA_POSITIONS__ = positions;
      window.__DNA_TEXTS__ = texts;
    });
    const query = { bossdebug: "1", watchagent: "1" };
    const ordinaryBoot = async () => {
      await boot(query);
      await page.waitForFunction(() => window.__TEAR_GHOST_V3__);
      // Keep the engineering inspector active while leaving the normal canvas
      // unobstructed. This changes only the disposable DOM panel's presentation.
      await page.addStyleTag({ content: "#tear-watch-agent { visibility: hidden !important; }" });
    };
    const clickText = async (label) => {
      await page.waitForFunction((text) => window.__DNA_POSITIONS__?.some((entry) => entry.text === text), label, {
        timeout: 10000,
      });
      const point = await page.evaluate(
        (text) => window.__DNA_POSITIONS__.findLast((entry) => entry.text === text),
        label,
      );
      await page.mouse.click(point.x, point.y);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const openDna = async () => {
      await page.mouse.click(260, 266);
      await waitScreen("profile");
      await clickText("VAULT");
      await page.waitForFunction(() =>
        window.__DNA_POSITIONS__.some((entry) => entry.text === "\u25c6 THEATER" && entry.y > 310),
      );
      const row = await page.evaluate(() =>
        window.__DNA_POSITIONS__.find((entry) => entry.text === "\u25c6 THEATER" && entry.y > 310),
      );
      await page.mouse.click(row.x, row.y);
      await waitScreen("replay");
      await clickText("RUN DNA");
      await page.waitForFunction(() =>
        window.__DNA_POSITIONS__.some((entry) => entry.text === "RUN DNA · RECORDED METRICS"),
      );
    };
    const metrics = [
      "attacks",
      "combatTicks",
      "misses",
      "movingTicks",
      "damageTaken",
      "maxHp",
      "distinctManeuvers",
      "availableManeuvers",
    ];
    const evidence = {
      buildInfo,
      engineeringOverlayHidden: true,
      fixture: "engineering:300 native ticks, no movement, throw140/recall150; no injected outcome or metrics",
    };
    try {
      await ordinaryBoot();
      await page.evaluate(() => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        environment.reset({
          format: "tear-contract",
          kind: "scenario",
          schemaVersion: 1,
          id: "c37-native-dna",
          version: 1,
          description: "Native source for durable Run DNA projection",
          stateClass: "recorded-canonical",
          executionClass: "engineering",
          seed: "run-dna-source",
          start: { mode: "endless", difficulty: "normal", weapon: "sword" },
          maxTicks: 300,
          assertions: ["runtime.finite-state"],
          tags: ["c37", "run-dna"],
        });
        for (let tick = 1; tick <= 300; tick++)
          environment.step(
            tick === 140
              ? [{ kind: "command", tick, id: 1, command: { type: "weapon", intent: "throw", phase: "pressed" } }]
              : tick === 150
                ? [{ kind: "command", tick, id: 2, command: { type: "weapon", intent: "recall", phase: "pressed" } }]
                : [],
          );
        environment.terminate();
      });
      await page.waitForFunction(
        () => window.__TEAR_GHOST_V3__.manifest() || window.__TEAR_GHOST_V3__.failure(),
        undefined,
        { timeout: 20000 },
      );
      assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
      const source = await page.evaluate(() => window.__TEAR_GHOST_V3__.read(window.__TEAR_GHOST_V3__.manifest().id));
      const original = JSON.stringify(source),
        id = source.manifest.id;
      const declarations = source.tracks.results.filter((entry) => entry.value?.kind === "run-dna-metrics-v1");
      assert.equal(declarations.length, 1, "One native recording must have exactly one metrics declaration");
      const declaration = declarations[0].value;
      evidence.id = id;
      evidence.declaration = declaration;
      assert.equal(declaration.capture.policy, "native-combat-episodes-v1");
      assert.equal(declaration.capture.complete, true);
      assert.deepEqual(declaration.capture.invalid, []);
      assert.ok(
        source.tracks.events.some((entry) => entry.value?.type === "blade.caught"),
        "Actual source catch required",
      );
      assert.ok(declaration.metrics.attacks > 0 && declaration.metrics.combatTicks > 0);
      for (const key of metrics) assert.ok(Number.isFinite(declaration.metrics[key]), `Missing native ${key}`);
      await ordinaryBoot();
      await openDna();
      const checkPanel = async () => {
        const labels = await page.evaluate(() => window.__DNA_POSITIONS__.map((entry) => entry.text));
        assert.ok(labels.includes("FORMULA run-dna-v1 · native-combat-episodes-v1"));
        assert.ok(labels.includes(`verified capsule ${id}`));
        for (const key of metrics)
          assert.ok(
            labels.includes(`${key.toUpperCase()} · ${String(declaration.metrics[key])}`),
            `Rendered ${key} differs from durable native capture`,
          );
        if (declaration.capture.censored > 0 || declaration.metrics.attacks === 0) {
          assert.ok(labels.some((label) => label.startsWith("UNAVAILABLE · precision:")));
          assert.ok(
            !labels.some((label) => /^PRECISION \d+%$/u.test(label)),
            "Censored precision must not display a percentage",
          );
        }
        assert.equal(
          JSON.stringify(await page.evaluate((sourceId) => window.__TEAR_GHOST_V3__.read(sourceId), id)),
          original,
        );
        return labels;
      };
      evidence.desktop = await checkPanel();
      if (directory) await page.screenshot({ path: join(directory, "desktop.png") });
      await page.setViewportSize({ width: 800, height: 450 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      evidence.compact = await checkPanel();
      evidence.compactPositions = await page.evaluate(() => window.__DNA_POSITIONS__);
      if (directory) await page.screenshot({ path: join(directory, "compact.png") });
      await page.setViewportSize({ width: 1600, height: 900 });
      await ordinaryBoot();
      await openDna();
      evidence.reopened = await checkPanel();
      if (directory) await page.screenshot({ path: join(directory, "reopened.png") });
      evidence.status = "passed";
    } catch (error) {
      evidence.status = "failed";
      evidence.error = String(error);
      evidence.state = await page.evaluate(() => window.__PANTHEON_TEST?.state());
      evidence.positions = await page.evaluate(() => window.__DNA_POSITIONS__);
      if (directory) await page.screenshot({ path: join(directory, "failure.png") });
      throw error;
    } finally {
      if (directory) await writeFile(join(directory, "journey.json"), JSON.stringify(evidence, null, 2));
    }
  },
)
  .then(() => console.log("C37 normal recorded Run DNA journey passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
