const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS, pollEvery, settleFor } = require("./browser-waits");

// Two journeys share this file: the Playground run, and the Practice Lab walk over
// every lesson, weapon annex, enemy and boss entry. Both run by default (the
// Practice Lab walk once sat behind an opt-in flag, which let a real page error
// in the annex flow ship); TEAR_PRACTICE_LAB_ONLY=1 runs the Practice Lab alone.
const journey = (practiceLab) =>
  withJourney(
    { name: practiceLab ? "practice lab journeys" : "playground journeys", port: practiceLab ? 8145 : 8144 },
    async ({ page, boot, waitScreen, restBlade }) => {
      async function pressUntilScreen(key, screen) {
        for (let attempt = 0; attempt < 12; attempt++) {
          await page.keyboard.press(key);
          try {
            await page.waitForFunction((expected) => window.__PANTHEON_TEST.state().game === expected, screen, {
              timeout: pollEvery(500),
            });
            await waitScreen(screen);
            return;
          } catch (error) {
            if (error?.name !== "TimeoutError") throw error;
          }
        }
        const snapshot = await page.evaluate(() => ({
          state: window.__PANTHEON_TEST.state(),
          input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
        }));
        assert.fail(`${key} did not reach ${screen}: ${JSON.stringify(snapshot)}`);
      }

      if (practiceLab) {
        // Declared historical completion/balance fixture; every subsequent entry,
        // lesson, restart and leave uses normal rendered controls. No course played.
        await page.addInitScript(() => {
          const fixture = {
            tear_profile_v2: JSON.stringify({
              schema: "tear.profile",
              schemaVersion: 3,
              revision: 1,
              updatedAtMs: 1,
              writerId: "practice-lab-ui-fixture",
              extensions: {},
              profile: {
                v: 1,
                created: 1,
                shards: 10,
                ach: { student: 1, first_buy: 1, boss_colossus: 1 },
                achCoinsRetrofit: true,
                modes: {},
                seen: {},
                stats: {
                  tutorialDone: 1,
                  coinsEarned: 1000,
                  shopBuys: 1,
                  kill_charger: 1,
                  kill_support: 1,
                  killColossus: 1,
                  "encounterBoss:warden:2": 1,
                },
              },
            }),
            tear_meta: JSON.stringify({ lifetimeEarned: 1000, lifetimeSpent: 375, buy: { sharp: 1 } }),
          };
          // test=1 uses composition's isolated storage, never localStorage. Carry
          // that adapter's actual bytes across this fixture's document reload.
          const retained = sessionStorage.getItem("practice-lab-fixture-storage");
          const seed = retained ? JSON.parse(retained) : fixture;
          window.__TEAR_TEST_STORAGE__ = seed;
          const NativeMap = window.Map;
          window.Map = new Proxy(NativeMap, {
            construct(target, args, newTarget) {
              try {
                const map = Reflect.construct(target, args, newTarget);
                if (map.get("tear_profile_v2") === seed.tear_profile_v2 && map.get("tear_meta") === seed.tear_meta) {
                  // Observe the real backing instance without intercepting reads or
                  // writes, then immediately leave all later Map creation untouched.
                  window.__TEAR_PRACTICE_LAB_STORAGE__ = map;
                  window.Map = NativeMap;
                }
                return map;
              } catch (error) {
                window.Map = NativeMap;
                throw error;
              }
            },
          });
          const captured = [],
            original = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function practiceLabText(value, x, y, ...rest) {
            captured.push({ text: String(value), x, y });
            if (captured.length > 1000) captured.splice(0, 500);
            return original.call(this, value, x, y, ...rest);
          };
          window.__TEAR_PRACTICE_LAB_TEXT__ = captured;
        });
        const directory = process.env.TEAR_PRACTICE_LAB_ARTIFACT_DIR;
        if (directory) fs.mkdirSync(path.resolve(directory), { recursive: true });
        // Where a label is drawn once the screen has eased in: two reads a frame apart agree.
        const labelAt = async (label) => {
          try {
            await page.waitForFunction(
              (expected) => window.__TEAR_PRACTICE_LAB_TEXT__?.some((entry) => entry.text === expected),
              label,
            );
          } catch (error) {
            const context = await page.evaluate(() => ({
              state: window.__PANTHEON_TEST.state(),
              storage: [...(window.__TEAR_PRACTICE_LAB_STORAGE__ ?? [])],
              text: window.__TEAR_PRACTICE_LAB_TEXT__,
            }));
            console.error(`Practice Lab missing rendered label ${label}: ${JSON.stringify(context)}`);
            if (directory)
              await page.screenshot({ path: path.join(path.resolve(directory), "practice-lab-failure.png") });
            throw error;
          }
          const handle = await page.waitForFunction(
            (expected) => {
              const entry = window.__TEAR_PRACTICE_LAB_TEXT__.findLast((candidate) => candidate.text === expected);
              const point = entry ? { x: Math.round(entry.x), y: Math.round(entry.y) } : null;
              const previous = window.__TEAR_PRACTICE_LAB_LAST_POINT__;
              window.__TEAR_PRACTICE_LAB_LAST_POINT__ = { label: expected, point };
              return point &&
                previous?.label === expected &&
                previous.point?.x === point.x &&
                previous.point.y === point.y
                ? point
                : null;
            },
            label,
            { polling: "raf", timeout: STATE_WAIT_MS },
          );
          return handle.jsonValue();
        };
        const clickLabel = async (label) => {
          const point = await labelAt(label);
          await page.mouse.click(point.x, point.y);
        };
        const savedEffects = () =>
          page.evaluate(() => {
            const storage = window.__TEAR_PRACTICE_LAB_STORAGE__;
            if (!storage) throw new Error("Practice Lab fixture did not observe the isolated storage adapter");
            const profile = JSON.parse(storage.get("tear_profile_v2")).profile;
            const meta = JSON.parse(storage.get("tear_meta"));
            const cinematicSeen = {
              browser: Object.fromEntries(
                Object.entries(localStorage).filter(([key]) => key.startsWith("tear.cinematic.")),
              ),
              adapter: Object.fromEntries([...storage].filter(([key]) => key.startsWith("tear.cinematic."))),
            };
            return {
              stats: profile.stats,
              tutorialDone: profile.stats.tutorialDone,
              achievements: profile.ach,
              earned: meta.lifetimeEarned,
              spent: meta.lifetimeSpent,
              buy: meta.buy,
              cinematicSeen,
            };
          });
        await boot();
        const before = await savedEffects();
        assert.equal(before.tutorialDone, 1, "the real isolated adapter must contain the completed-profile fixture");
        assert.equal(before.earned, 1000);
        assert.equal(before.spent, 375);
        assert.equal(before.buy.sharp, 1);
        await clickLabel("PRACTICE LAB");
        await waitScreen("paused");
        let session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
        assert.equal(session.practiceOnly, true);
        assert.equal(session.courseCompleted, false);
        assert.equal(session.lessons.filter((lesson) => lesson.canPractice).length, 13);
        assert.ok(
          session.lessons.every((lesson) => !lesson.completed),
          "historical lesson history must remain unknown",
        );
        if (directory) await page.screenshot({ path: path.join(path.resolve(directory), "practice-lab-selector.png") });
        await clickLabel("LAUNCH");
        await waitScreen("playing");
        assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.tutorial().lessonIndex), 4);
        assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().weapon), "sword");
        assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().difficulty), "normal");
        await pressUntilScreen("p", "paused");
        await clickLabel("RESTART LESSON");
        await waitScreen("playing");
        assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.tutorial().counters.launch ?? 0), 0);
        await pressUntilScreen("p", "paused");
        await clickLabel("WEAPON ANNEXES");
        if (directory)
          await page.screenshot({ path: path.join(path.resolve(directory), "practice-lab-weapon-annexes.png") });
        for (const weapon of ["sword", "hammer", "greatsword", "chainblade", "riftlock"]) {
          await clickLabel(weapon.toUpperCase());
          await waitScreen("playing");
          const attempt = await page.evaluate(() => ({
            state: window.__PANTHEON_TEST.state(),
            tutorial: window.__PANTHEON_TEST.tutorial().session,
            run: window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").captureSnapshot("annex-baseline", "recorded-canonical")
              .state["tear.run.v1"],
          }));
          assert.equal(attempt.state.weapon, weapon);
          assert.equal(attempt.state.difficulty, "normal");
          assert.equal(attempt.tutorial.practiceOnly, true);
          assert.equal(attempt.tutorial.courseCompleted, false);
          assert.equal(attempt.tutorial.annex.id, weapon);
          assert.equal(attempt.tutorial.annex.progress, 0);
          assert.deepEqual(attempt.run.mods.owned, {}, "annexes must start without run upgrades");
          await pressUntilScreen("p", "paused");
          await clickLabel("RESTART LESSON");
          await waitScreen("playing");
          assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session.annex.progress), 0);
          assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().weapon), weapon);
          await pressUntilScreen("p", "paused");
        }
        await clickLabel("ENEMY CATALOG");
        session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
        assert.equal(session.enemyCatalog.find((entry) => entry.id === "charger").knowledge, "confirmed-defeated");
        assert.equal(
          session.enemyCatalog.find((entry) => entry.id === "mender").knowledge,
          "unknown",
          "aggregate old support kills must not invent subtype history",
        );
        await page.waitForFunction(() =>
          window.__TEAR_PRACTICE_LAB_TEXT__.some((entry) => entry.text === "HISTORY NOT RECORDED"),
        );
        if (directory)
          await page.screenshot({ path: path.join(path.resolve(directory), "practice-lab-enemy-catalog.png") });
        await clickLabel("CHARGER");
        await waitScreen("playing");
        // The game keeps running between two page calls, so the blade can touch a fresh opponent
        // after one call sees it spawn and before a second call reads it. Read it in the same
        // page task that finds it. A restart reloads the arena on a later update, so the old
        // opponent can still be counted when play resumes: `spawned` turns true only after the
        // reload, when the new opponent is issued.
        const opponentAttempt = async () =>
          (
            await page.waitForFunction(
              () => {
                const state = window.__PANTHEON_TEST.state();
                const session = window.__PANTHEON_TEST.tutorial().session;
                if (state.enemyCount !== 1 || session.enemyPractice?.spawned !== true) return null;
                return {
                  session,
                  state,
                  snapshot: window.__TEAR_RUNTIME_ENVIRONMENT__
                    .create("A")
                    .captureSnapshot("enemy-practice", "recorded-canonical"),
                };
              },
              undefined,
              { timeout: STATE_WAIT_MS },
            )
          ).jsonValue();
        let opponent = await opponentAttempt();
        assert.equal(opponent.state.weapon, "sword");
        assert.equal(opponent.state.difficulty, "normal");
        assert.deepEqual(opponent.snapshot.state["tear.run.v1"].mods.owned, {});
        assert.equal(opponent.session.enemyPractice.id, "charger");
        assert.equal(opponent.snapshot.state["tear.enemy.v1"].length, 1);
        assert.equal(opponent.snapshot.state["tear.enemy.v1"][0].kind, "charger");
        assert.notEqual(opponent.snapshot.state["tear.enemy.v1"][0].tutDummy, true);
        // The restarted opponent spawns beside the player, and the blade swings to wherever the
        // pointer moved while paused. Rest it aimed at RESTART LESSON first, so the click there
        // resumes play with a still blade (see restBlade in the harness).
        await pressUntilScreen("p", "paused");
        const restart = await labelAt("RESTART LESSON");
        await pressUntilScreen("p", "playing");
        await restBlade(restart);
        await pressUntilScreen("p", "paused");
        await clickLabel("RESTART LESSON");
        await waitScreen("playing");
        opponent = await opponentAttempt();
        assert.equal(opponent.session.enemyPractice.defeated, false);
        {
          // A restart issues a full-health opponent. If it is ever seen damaged, say how long it had
          // been alive (spawnT counts down from its spawn-in) and what was near it in that same snapshot.
          const state = opponent.snapshot.state;
          const enemy = state["tear.enemy.v1"][0];
          const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value?.[key]]));
          assert.equal(
            enemy.hp,
            enemy.maxHp,
            `restarted practice opponent was damaged before the first read: ${JSON.stringify({
              enemy: pick(enemy, ["x", "y", "vx", "vy", "spawnT", "aliveT", "atk", "atkT", "flash", "hitCd", "stun"]),
              enemyStatus: pick(enemy, ["bleedStacks", "burnT", "burnDps", "_deathCause", "affixes"]),
              blade: pick(state["tear.blade.v1"], ["state", "x", "y", "tipX", "tipY", "tipSpeed", "swingActive"]),
              player: pick(state["tear.player.v1"], ["x", "y", "vx", "vy", "hp"]),
              projectiles: state["tear.projectile.v1"]?.length,
              hazards: pick(state["tear.hazard.v1"], ["stageId", "fields", "combatObjects"]),
              clock: state["tear.world.v1"]?.clock,
              simulationSeconds: state["tear.world.v1"]?.simulationSeconds,
            })}`,
          );
        }
        await pressUntilScreen("p", "paused");
        await clickLabel("BOSS PRACTICE");
        session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
        assert.equal(session.bossCatalog.length, 18);
        assert.equal(session.bossCatalog.find((entry) => entry.id === "colossus:1").knowledge, "defeated-identity");
        assert.equal(session.bossCatalog.find((entry) => entry.id === "colossus:2").canPractice, false);
        assert.equal(session.bossCatalog.find((entry) => entry.id === "warden:2").canPractice, true);
        assert.equal(session.bossCatalog.find((entry) => entry.id === "warden:3").canPractice, false);
        if (directory)
          await page.screenshot({ path: path.join(path.resolve(directory), "practice-lab-boss-phases.png") });
        await page.setViewportSize({ width: 800, height: 360 });
        await page.evaluate(() => {
          window.__TEAR_PRACTICE_LAB_TEXT__.length = 0;
        });
        await page.mouse.wheel(0, 144);
        await page.waitForFunction(() =>
          window.__TEAR_PRACTICE_LAB_TEXT__.some((entry) => entry.text === "THE SOURCE · P3"),
        );
        if (directory)
          await page.screenshot({ path: path.join(path.resolve(directory), "practice-lab-boss-phases-landscape.png") });
        await page.mouse.wheel(0, -144);
        await page.setViewportSize({ width: 1600, height: 900 });
        await page.waitForTimeout(settleFor(100));
        await clickLabel("IRON COLOSSUS · P1");
        await waitScreen("playing");
        await page.waitForFunction(
          () => window.__PANTHEON_TEST.tutorial().session.bossPractice?.runtime.lifecycle === "active",
        );
        let bossAttempt = await page.evaluate(() => ({
          tutorial: window.__PANTHEON_TEST.tutorial().session,
          state: window.__PANTHEON_TEST.state(),
          snapshot: window.__TEAR_RUNTIME_ENVIRONMENT__
            .create("A")
            .captureSnapshot("boss-practice", "recorded-canonical"),
        }));
        assert.equal(bossAttempt.tutorial.bossPractice.bossId, "colossus");
        assert.equal(bossAttempt.tutorial.bossPractice.phase, 1);
        assert.equal(bossAttempt.state.weapon, "sword");
        assert.equal(bossAttempt.state.difficulty, "normal");
        assert.deepEqual(bossAttempt.snapshot.state["tear.run.v1"].mods.owned, {});
        assert.equal(bossAttempt.snapshot.state["tear.boss.v1"][0].bossId, "colossus");
        await pressUntilScreen("p", "paused");
        await clickLabel("RESTART LESSON");
        await waitScreen("playing");
        await page.waitForFunction(
          () => window.__PANTHEON_TEST.tutorial().session.bossPractice?.runtime.lifecycle === "active",
        );
        await pressUntilScreen("p", "paused");
        // Saved phase fixture, not claimed natural phase discovery.
        await clickLabel("THE WARDEN · P2");
        await waitScreen("playing");
        await page.waitForFunction(
          () => window.__PANTHEON_TEST.tutorial().session.bossPractice?.runtime.lifecycle === "active",
          undefined,
          { timeout: STATE_WAIT_MS },
        );
        await pressUntilScreen("p", "paused");
        await clickLabel("MAIN MENU");
        await waitScreen("confirmquit");
        await clickLabel("QUIT");
        await waitScreen("menu");
        assert.deepEqual(
          await savedEffects(),
          before,
          "practice must leave actual adapter completion/reward state unchanged before reload",
        );
        await page.evaluate(() =>
          sessionStorage.setItem(
            "practice-lab-fixture-storage",
            JSON.stringify(Object.fromEntries(window.__TEAR_PRACTICE_LAB_STORAGE__)),
          ),
        );
        await boot();
        // Re-enter through the ordinary setup screen after a full page reload.
        await clickLabel("PLAY");
        await waitScreen("setup");
        await clickLabel("PRACTICE LAB");
        await waitScreen("paused");
        session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
        assert.equal(session.practiceOnly, true);
        assert.equal(session.phase, "free-practice");
        await clickLabel("ENEMY CATALOG");
        session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
        assert.equal(session.enemyCatalog.find((entry) => entry.id === "charger").knowledge, "confirmed-defeated");
        assert.equal(session.enemyCatalog.find((entry) => entry.id === "mender").canPractice, false);
        await clickLabel("BOSS PRACTICE");
        session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
        assert.equal(session.bossCatalog.find((entry) => entry.id === "warden:2").canPractice, true);
        assert.equal(session.bossCatalog.find((entry) => entry.id === "warden:3").canPractice, false);
        assert.deepEqual(
          await savedEffects(),
          before,
          "opening/restarting practice must not add completion, achievements, coins or purchases",
        );
        console.log(
          "Practice Lab UI fixture passed: completed-profile adapter bytes reconstructed after reload, normal menu/setup entry, lesson, five weapon annexes and known real-opponent and six-boss phase catalog selection/reset; unknown subtype history preserved, no discovery or reward grant",
        );
        return;
      }

      await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
      await waitScreen("playing");
      console.log("playground journey: run ready");

      // Hotkey spawns run at the combat-tail boundary. Each must survive the filtered
      // entity-list commit performed earlier in the same fixed tick.
      for (const key of ["1", "2", "3", "t", "b"]) {
        const before = await page.evaluate(() => window.__PANTHEON_TEST.state().enemyCount);
        await page.keyboard.press(key);
        try {
          await page.waitForFunction((count) => window.__PANTHEON_TEST.state().enemyCount > count, before, {
            timeout: STATE_WAIT_MS,
          });
        } catch (error) {
          if (error?.name !== "TimeoutError") throw error;
          const snapshot = await page.evaluate(() => ({
            state: window.__PANTHEON_TEST.state(),
            input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
          }));
          assert.fail(`${key} did not spawn an enemy from ${before}: ${JSON.stringify(snapshot)}`);
        }
      }
      await page.keyboard.press("k");
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().enemyCount === 0, undefined, {
        timeout: STATE_WAIT_MS,
      });
      console.log("playground journey: combat hotkey spawns survive the tail commit");

      // The in-world E shortcut shown by the production Playground help opens the tools.
      await pressUntilScreen("e", "pgmenu");
      console.log("playground journey: build menu open");
      const enemiesBefore = await page.evaluate(() => window.__PANTHEON_TEST.state().enemyCount);
      await page.mouse.click(278, 229); // spawn the first enemy kind
      await page.waitForFunction((before) => window.__PANTHEON_TEST.state().enemyCount > before, enemiesBefore, {
        timeout: STATE_WAIT_MS,
      });
      console.log("playground journey: enemy spawned");

      await page.mouse.click(330, 721); // ABILITY LAB
      await waitScreen("pglab");
      console.log("playground journey: ability lab open");
      await page.mouse.click(721, 272); // TAKE the first available ability
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.mouse.wheel(0, 500);
      await page.mouse.click(800, 850); // BUILD MENU (lab back control)
      await waitScreen("pgmenu");
      console.log("playground journey: returned to build menu");
      await page.mouse.click(800, 780); // RESUME (source-position band under the actions row)
      await waitScreen("playing");
      console.log("playground journey: pointer resume");

      await pressUntilScreen("u", "pglab");
      await pressUntilScreen("Tab", "pgmenu");
      await pressUntilScreen("Tab", "playing");
      assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().mode), "playground");
    },
  );

(process.env.TEAR_PRACTICE_LAB_ONLY === "1" ? journey(true) : journey(false).then(() => journey(true)))
  .then(() => console.log("browser playground journeys passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
