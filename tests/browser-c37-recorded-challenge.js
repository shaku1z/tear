const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { withJourney, waitForBrowserValue } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

// One engineered immutable parent; both attempts use the ordinary live UI/RAF.
withJourney(
  { name: "C37 recorded local challenge", port: 8155, deferBoot: true, ordinaryWatch: true },
  async ({ page, boot, waitScreen, buildInfo }) => {
    const directory = process.env.TEAR_CHALLENGE_ARTIFACT_DIR;
    if (directory) await mkdir(directory, { recursive: true });
    await page.addInitScript(() => {
      if (!localStorage.getItem("challenge-fixture-installed")) {
        localStorage.setItem(
          "tear_meta",
          JSON.stringify({ lifetimeEarned: 1000, lifetimeSpent: 325, buy: { toughness: 1 } }),
        );
        localStorage.setItem(
          "tear_profile",
          JSON.stringify({
            v: 1,
            shards: 123,
            ach: {},
            stats: { runs: 7, kills: 11 },
            seen: {},
            modes: {},
            created: 1700000000000,
            achCoinsRetrofit: true,
          }),
        );
        localStorage.setItem("challenge-fixture-installed", "1");
      }
      const positions = [],
        texts = [],
        original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
        const label = String(text);
        if (
          label === "PROFILE" ||
          label === "LOCAL RECORDED CHALLENGE" ||
          (rest[1] < 80 && ["\u25c6 THEATER", "\u25b6 REPLAY"].includes(label))
        )
          positions.length = 0;
        positions.push({ text: label, x: rest[0], y: rest[1] });
        texts.push(label);
        if (texts.length > 20000) texts.splice(0, 10000);
        return original.call(this, text, ...rest);
      };
      window.__CHALLENGE_POSITIONS__ = positions;
      window.__CHALLENGE_TEXTS__ = texts;
    });
    // Existing inspector opt-in; actual local storage, without disposable test=1.
    const query = { bossdebug: "1", watchagent: "1" };
    const clickText = async (text, settle = true) => {
      await page.waitForFunction(
        (label) => window.__CHALLENGE_POSITIONS__?.some((entry) => entry.text === label),
        text,
        { timeout: STATE_WAIT_MS },
      );
      const point = await page.evaluate(
        (label) => window.__CHALLENGE_POSITIONS__.findLast((entry) => entry.text === label),
        text,
      );
      await page.mouse.click(point.x, point.y);
      if (settle)
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
    };
    const savedProgress = () =>
      page.evaluate(() =>
        Object.fromEntries(
          ["tear_meta", "tear_profile", "tear_profile_v2"].map((key) => [key, localStorage.getItem(key)]),
        ),
      );
    const progressionPayload = (saved) => {
      const envelope = JSON.parse(saved.tear_profile_v2);
      // Ordinary profile loading commits a fresh envelope revision/time. Keep all
      // progression, extension, schema and writer fields in the reload comparison.
      delete envelope.revision;
      delete envelope.updatedAtMs;
      return { ...saved, tear_profile_v2: envelope };
    };
    const evidence = {
      buildInfo,
      parentFixture: "300 canonical ticks; throw140/recall150; no movement; engineering source",
      attempts: [],
    };
    const openVault = async () => {
      await page.mouse.click(260, 266);
      await waitScreen("profile");
      await clickText("VAULT");
      await page.waitForFunction(
        () => window.__CHALLENGE_POSITIONS__.some((entry) => entry.text === "\u25c6 THEATER" && entry.y > 310),
        undefined,
        { timeout: STATE_WAIT_MS },
      );
    };
    const openRow = async (index) => {
      const points = await page.evaluate(() =>
        [
          ...new Map(
            window.__CHALLENGE_POSITIONS__
              .filter((entry) => entry.text === "\u25c6 THEATER" && entry.y > 310)
              .map((entry) => [entry.y, entry]),
          ).values(),
        ].sort((a, b) => a.y - b.y),
      );
      assert.ok(points[index], `Missing visible Vault row ${index}`);
      await page.mouse.click(points[index].x, points[index].y);
      await waitScreen("replay");
    };
    const proofFromBrowser = async (attemptId) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("tear-ghost-v3");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = database
            .transaction("analysis", "readonly")
            .objectStore("analysis")
            .get(`recorded-challenge:${attemptId}`);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    };
    const readProof = (id) => page.evaluate(proofFromBrowser, id);
    try {
      await boot(query);
      await page.waitForFunction(() => window.__TEAR_GHOST_V3__);
      await page.evaluate(() => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        environment.reset({
          format: "tear-contract",
          kind: "scenario",
          schemaVersion: 1,
          id: "c37-real-parent",
          version: 1,
          description: "Engineering parent for normal local challenge journey",
          stateClass: "recorded-canonical",
          executionClass: "engineering",
          seed: "challenge-source",
          start: { mode: "endless", difficulty: "normal", weapon: "sword" },
          maxTicks: 300,
          assertions: ["runtime.finite-state"],
          tags: ["c37", "challenge"],
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
        { timeout: STATE_WAIT_MS },
      );
      assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
      const source = await page.evaluate(() => window.__TEAR_GHOST_V3__.read(window.__TEAR_GHOST_V3__.manifest().id));
      const original = JSON.stringify(source),
        parentId = source.manifest.id;
      evidence.parentId = parentId;
      evidence.sourceCatch = source.tracks.events.find(
        (entry) => entry.tick > 120 && entry.value?.type === "blade.caught",
      );
      assert.ok(evidence.sourceCatch, "Source needs an actual post-checkpoint catch");
      await boot(query);
      await page.waitForFunction(() => window.__TEAR_GHOST_V3__);
      evidence.progressBefore = await savedProgress();
      assert.ok(
        evidence.progressBefore.tear_meta && evidence.progressBefore.tear_profile_v2,
        "Persisted nonzero progression must exist",
      );
      assert.equal(JSON.parse(evidence.progressBefore.tear_meta).lifetimeSpent, 325);
      await openVault();
      await openRow(0);
      await page.mouse.click(428, 854);
      await page.waitForFunction(() =>
        window.__CHALLENGE_POSITIONS__.some((entry) => entry.text.startsWith("0:01 / ")),
      );
      await clickText("LOCAL CHALLENGE");
      await page.waitForFunction(() =>
        window.__CHALLENGE_POSITIONS__.some((entry) => entry.text.startsWith("RETURN RACE")),
      );
      const race = await page.evaluate(() =>
        window.__CHALLENGE_POSITIONS__.find((entry) => entry.text.startsWith("RETURN RACE")),
      );
      evidence.raceLabel = race.text;
      await page.mouse.click(race.x, race.y);
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing", undefined, {
        polling: "raf",
        timeout: STATE_WAIT_MS,
      });
      await page.mouse.move(1200, 400);
      await page.mouse.click(1200, 400, { button: "right" });
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().bladeTrace?.state !== "held", undefined, {
        polling: "raf",
        timeout: STATE_WAIT_MS,
      });
      await page.mouse.click(1200, 400, { button: "right" });
      const succeeded = await waitForBrowserValue(
        page,
        async () =>
          (await window.__TEAR_GHOST_V3__.manifests()).find(
            (entry) => entry.provenance?.forkOrigin && entry.status === "complete",
          ),
        undefined,
        { timeout: STATE_WAIT_MS },
      );
      const successProofBytes = await waitForBrowserValue(page, proofFromBrowser, succeeded.id, {
        timeout: STATE_WAIT_MS,
      });
      const result = JSON.parse(successProofBytes);
      assert.equal(result.status, "succeeded");
      assert.equal(result.proof.completed, true);
      const attempt = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), succeeded.id);
      assert.equal(attempt.manifest.provenance.forkOrigin.checkpoint.tick, 120);
      assert.ok(attempt.tracks.commands.length > 0 && attempt.tracks.commands.every((entry) => entry.tick > 120));
      assert.ok(attempt.tracks.events.some((entry) => entry.value?.type === "blade.caught"));
      assert.equal(
        await page.evaluate(
          (id) => JSON.stringify(window.__TEAR_GHOST_V3__.activePractice()?.sourceGhostId === id),
          parentId,
        ),
        "true",
      );
      evidence.attempts.push({
        id: succeeded.id,
        result,
        commands: attempt.tracks.commands,
        events: attempt.tracks.events,
      });
      evidence.progressAfterSuccess = await savedProgress();
      assert.deepEqual(evidence.progressAfterSuccess, evidence.progressBefore);
      await boot(query);
      await page.waitForFunction(() => window.__TEAR_GHOST_V3__);
      await openVault();
      await openRow(0);
      await page.waitForFunction(() =>
        window.__CHALLENGE_POSITIONS__.some((entry) => entry.text.startsWith("RECORDED RESULT · SUCCEEDED")),
      );
      if (directory) await page.screenshot({ path: join(directory, "succeeded-reopened.png") });
      assert.equal(await readProof(succeeded.id), successProofBytes);
      await page.keyboard.press("Escape");
      await waitScreen("profile");
      await openRow(1);
      await page.mouse.click(428, 854);
      await page.waitForFunction(() =>
        window.__CHALLENGE_POSITIONS__.some((entry) => entry.text.startsWith("0:01 / ")),
      );
      await clickText("LOCAL CHALLENGE");
      await page.waitForFunction(() =>
        window.__CHALLENGE_POSITIONS__.some((entry) => entry.text.startsWith("CLEAR WAVE")),
      );
      const wave = await page.evaluate(() =>
        window.__CHALLENGE_POSITIONS__.find((entry) => entry.text.startsWith("CLEAR WAVE")),
      );
      evidence.progressBeforeStop = await savedProgress();
      await page.mouse.click(wave.x, wave.y);
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing", undefined, {
        polling: "raf",
        timeout: STATE_WAIT_MS,
      });
      await page.keyboard.press("Escape");
      await waitScreen("paused");
      await clickText("MAIN MENU");
      await waitScreen("confirmquit");
      await clickText("QUIT");
      const stopped = await waitForBrowserValue(
        page,
        async (id) =>
          (await window.__TEAR_GHOST_V3__.manifests()).find(
            (entry) => entry.provenance?.forkOrigin && entry.id !== id && entry.status === "complete",
          ),
        succeeded.id,
        { timeout: STATE_WAIT_MS },
      );
      const stoppedProof = await waitForBrowserValue(page, proofFromBrowser, stopped.id, { timeout: STATE_WAIT_MS });
      assert.ok(stoppedProof, "Stopped attempt proof must persist");
      assert.equal(JSON.parse(stoppedProof).status, "abandoned");
      assert.equal(JSON.parse(stoppedProof).proof.completed, false);
      evidence.attempts.push({ id: stopped.id, result: JSON.parse(stoppedProof) });
      evidence.progressAfterStop = await savedProgress();
      assert.deepEqual(evidence.progressAfterStop, evidence.progressBeforeStop);
      await boot(query);
      await page.waitForFunction(() => window.__TEAR_GHOST_V3__);
      await openVault();
      await openRow(0);
      await page.waitForFunction(() =>
        window.__CHALLENGE_POSITIONS__.some((entry) => entry.text.startsWith("RECORDED RESULT · ABANDONED")),
      );
      if (directory) await page.screenshot({ path: join(directory, "abandoned-reopened.png") });
      assert.equal(JSON.stringify(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), parentId)), original);
      evidence.progressAfterReload = await savedProgress();
      assert.deepEqual(progressionPayload(evidence.progressAfterReload), progressionPayload(evidence.progressBefore));
      evidence.status = "passed";
    } catch (error) {
      evidence.status = "failed";
      evidence.error = String(error);
      evidence.state = await page.evaluate(() => window.__PANTHEON_TEST?.state());
      evidence.texts = await page.evaluate(() => window.__CHALLENGE_TEXTS__?.slice(-120));
      if (directory) await page.screenshot({ path: join(directory, "failure.png") });
      throw error;
    } finally {
      if (directory) await writeFile(join(directory, "journey.json"), JSON.stringify(evidence, null, 2));
    }
  },
)
  .then(() => console.log("C37 normal recorded challenge journey passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
