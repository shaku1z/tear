/* eslint-disable @typescript-eslint/no-require-imports -- Browser evidence scripts run directly under Node CommonJS. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const baseSeed = Number(process.env.C24_LONGITUDINAL_SEED || 4);
const maxEpisodes = Number(process.env.C24_LONGITUDINAL_MAX_EPISODES || 5);
const maxSpend = Number(process.env.C24_LONGITUDINAL_MAX_SPEND || 1500);
const r18 = process.env.TEAR_R18_CONTROLLED_COHORT === "1";

withJourney({ name: r18 ? "R18 controlled Normal depth cohort" : "C24 longitudinal earned-profile journey", port: 8155,
  ...(r18 ? { deferBoot: true, ordinaryWatch: true, query: { test: "0", watchagent: "1" } } : {}) }, async ({ page, errors, boot, buildInfo }) => {
  if (r18) {
    const directory = process.env.TEAR_R18_ARTIFACT_DIR || "C:/tmp/tear-r18-controlled-cohort-20261019";
    assert.ok(path.isAbsolute(directory), "R18 evidence destination must be absolute");
    fs.mkdirSync(directory); // Exclusive: never replace a previous cohort's evidence.
    const started = Date.now(), deadline = started + 20 * 60_000;
    const report = { format: "tear-r18-controlled-depth-cohort", schemaVersion: 1, buildInfo,
      classification: "controlled-scripted-engineering-local-only", certified: false,
      policy: { profile: "competent", mode: "campaign", difficulty: "normal", weapon: "riftlock", journey: "single-run", seeds: [117, 118, 119, 120],
        withdrawal: "first playing observation at wave 9; retain actual eventual terminal depth",
        cinematics: "existing Watch engineering skip bridge", input: "canonical semantic policy actions; physical release events at withdrawal",
        baseline: "zero permanent ranks throughout all four runs; ordinary run-local drafts remain enabled" },
      budgetsMs: { total: 1_200_000, policyPerRun: 180_000, passiveDefeatPerRun: 60_000, bootShopReload: 180_000, cleanupReserve: 60_000 },
      startedAt: new Date(started).toISOString(), episodes: [], capsules: [], earnedOnly: 0, firstCrossingRun: null, purchase: null, errors: [] };
    const save = () => fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
    save();
    const ceiling = setTimeout(() => { report.errors.push("twenty-minute hard ceiling"); save(); void page.close().catch((error) => { report.errors.push(String(error)); }); }, deadline - Date.now());
    const checkBudget = () => { assert.ok(Date.now() < deadline - 60_000, "cohort exhausted its budget; reserve cleanup time"); };
    const storage = () => page.evaluate(() => {
      const profileRaw = localStorage.getItem("tear_profile_v2"), metaRaw = localStorage.getItem("tear_meta");
      const profile = profileRaw ? JSON.parse(profileRaw).profile : {}, meta = metaRaw ? JSON.parse(metaRaw) : {};
      return { earned: meta.lifetimeEarned ?? 0, spent: meta.lifetimeSpent ?? 0, buy: meta.buy ?? {},
        receipts: meta.rewardReceipts?.receipts ?? {}, achievements: profile.ach ?? {}, stats: profile.stats ?? {},
        pending: Object.values(profile.achievementOutbox?.grants ?? {}).filter((grant) => !grant.acknowledged).length };
    });
    const settledStorage = async () => {
      await page.waitForFunction(() => {
        const raw = localStorage.getItem("tear_profile_v2"), profile = raw ? JSON.parse(raw).profile : {};
        return Object.values(profile.achievementOutbox?.grants ?? {}).every((grant) => grant.acknowledged);
      }, undefined, { timeout: 10_000 });
      return storage();
    };
    const clickText = async (label) => {
      await page.waitForFunction((expected) => window.__R18_TEXT__.some((entry) => entry.text === expected && performance.now() - entry.at < 250), label, { timeout: 10_000 });
      const point = await page.evaluate((expected) => window.__R18_TEXT__.findLast((entry) => entry.text === expected), label);
      await page.mouse.click(point.x, point.y - 3);
    };
    const release = async () => {
      for (const key of ["a", "d", "w", "s", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]) await page.keyboard.up(key);
      await page.mouse.up({ button: "left" }); await page.mouse.up({ button: "right" });
    };
    // Capture existing sidecar diagnostics without starting, sealing or repairing it.
    const observeRecorder = () => page.evaluate(async () => {
      const inspector = window.__TEAR_GHOST_V3__;
      const observation = { observedAt: new Date().toISOString(), recorder: inspector === undefined ? null : {
        failure: inspector.failure(), active: inspector.active(), manifest: inspector.manifest(),
      }, databasePresent: false, capsuleStatuses: [] };
      if (!(await indexedDB.databases()).some((entry) => entry.name === "tear-ghost-v3")) return observation;
      observation.databasePresent = true;
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("tear-ghost-v3"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error("capsule database disappeared during observation")); };
      });
      try {
        if (!database.objectStoreNames.contains("manifests")) return observation;
        observation.capsuleStatuses = await new Promise((resolve, reject) => {
          const transaction = database.transaction("manifests", "readonly"), statuses = [];
          const request = transaction.objectStore("manifests").openCursor();
          request.onsuccess = () => {
            const cursor = request.result; if (!cursor) return;
            try {
              const manifest = JSON.parse(cursor.value);
              statuses.push({ key: cursor.key, id: manifest.id, status: manifest.status, chunkCount: manifest.chunks?.length });
            } catch (error) { statuses.push({ key: cursor.key, parseError: String(error) }); }
            cursor.continue();
          };
          transaction.oncomplete = () => resolve(statuses); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
        });
        return observation;
      } finally { database.close(); }
    });
    // Read-only archival copy of already completed local capsules. No sealing,
    // repair, publication, admission, profile mutation or synthetic capsule.
    const preserveCapsules = async () => {
      if (page.isClosed()) { report.capsuleAbsence = "page closed before readback"; return; }
      report.recorderAtArchive = await observeRecorder(); save();
      const available = await page.evaluate(async () => {
        if (!(await indexedDB.databases()).some((entry) => entry.name === "tear-ghost-v3")) return [];
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open("tear-ghost-v3"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
          request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error("capsule database disappeared")); };
        });
        try {
          if (!database.objectStoreNames.contains("manifests") || !database.objectStoreNames.contains("chunks")) return [];
          return await new Promise((resolve, reject) => {
            const transaction = database.transaction(["manifests", "chunks"], "readonly"), archives = [];
            const request = transaction.objectStore("manifests").openCursor();
            request.onsuccess = () => {
              const cursor = request.result; if (!cursor) return;
              const rawManifest = cursor.value, manifest = JSON.parse(rawManifest);
              if (manifest.status === "complete") {
                const archive = { rawManifest, manifest, chunks: {} }; archives.push(archive);
                for (const chunk of manifest.chunks) {
                  const read = transaction.objectStore("chunks").get(chunk.id);
                  read.onsuccess = () => { archive.chunks[chunk.id] = read.result; };
                }
              }
              cursor.continue();
            };
            transaction.oncomplete = () => resolve(archives); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
          });
        } finally { database.close(); }
      });
      for (const [index, archive] of available.entries()) {
        const prefix = `capsule-${String(index + 1).padStart(2, "0")}`;
        assert.ok(Object.values(archive.chunks).every((raw) => typeof raw === "string"), "completed capsule has absent encoded chunks");
        fs.writeFileSync(path.join(directory, `${prefix}-manifest.json`), archive.rawManifest, { flag: "wx" });
        fs.writeFileSync(path.join(directory, `${prefix}-encoded.json`), JSON.stringify({ manifest: archive.manifest, chunks: archive.chunks }), { flag: "wx" });
        report.capsules.push({ id: archive.manifest.id, rootIntegrity: archive.manifest.rootIntegrity, provenance: archive.manifest.provenance,
          manifest: `${prefix}-manifest.json`, encoded: `${prefix}-encoded.json`, classification: "controlled-scripted-engineering-local-only", published: false, admittedForTraining: false });
      }
      if (!available.length) report.capsuleAbsence = "no completed capsule retained at final readback; none constructed";
    };
    try {
      await page.addInitScript(() => {
        window.__R18_PREBOOT_STORAGE__ = { profile: localStorage.getItem("tear_profile_v2"), legacy: localStorage.getItem("tear_profile"), meta: localStorage.getItem("tear_meta") };
        window.__R18_TEXT__ = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function r18ObservedText(value, x, y, ...rest) {
          window.__R18_TEXT__.push({ text: String(value), x, y, at: performance.now() });
          if (window.__R18_TEXT__.length > 3000) window.__R18_TEXT__.splice(0, 1500);
          return original.call(this, value, x, y, ...rest);
        };
      });
      await boot(); await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__);
      report.preboot = await page.evaluate(() => window.__R18_PREBOOT_STORAGE__);
      assert.deepEqual(report.preboot, { profile: null, legacy: null, meta: null }, "cohort must begin with genuinely absent ordinary save bytes");
      report.initial = await settledStorage();
      assert.equal(report.initial.earned, 0); assert.equal(report.initial.spent, 0); assert.deepEqual(report.initial.buy, {});
      for (const [label, value] of [["Profile", "competent"], ["Mode", "campaign"], ["Difficulty", "normal"], ["Weapon", "riftlock"], ["Journey", "single-run"]]) await page.getByLabel(label, { exact: true }).selectOption(value);
      for (const [index, seed] of report.policy.seeds.entries()) {
        checkBudget();
        const episode = { number: index + 1, seed, startedAt: new Date().toISOString(), before: await settledStorage() };
        report.episodes.push(episode); save();
        assert.deepEqual(episode.before.buy, {}, "permanent upgrades must remain absent for every cohort run");
        await page.getByLabel("Seed", { exact: true }).fill(String(seed));
        await page.getByRole("button", { name: /^Start (?:Watch Agent|Run Monitor)$/u }).click();
        const policyDeadline = Math.min(Date.now() + 180_000, deadline - 120_000);
        let snapshot;
        while (Date.now() < policyDeadline) {
          snapshot = await page.evaluate(async () => {
            const api = window.__TEAR_WATCH_AGENT__;
            let state = api.snapshot();
            for (let step = 0; step < 200; step++) {
              if (state.status !== "running" || ["continue", "gameover", "win"].includes(state.screen) || (state.screen === "playing" && state.wave >= 9)) break;
              state = await api.runAsync(1); // Inspect every actual application-frame result, never skip across the withdrawal boundary.
            }
            return { status: state.status, screen: state.screen, wave: state.wave ?? null, hp: state.hp ?? null,
              fixedTicks: state.fixedTicks, decisions: state.decisions, debugTransitions: state.debugTransitions, selection: state.selection };
          });
          if (snapshot.status !== "running" || ["continue", "gameover", "win"].includes(snapshot.screen) || (snapshot.screen === "playing" && snapshot.wave >= 9)) break;
        }
        episode.withdrawal = snapshot ?? null;
        episode.policyTimedOut = Date.now() >= policyDeadline;
        if (snapshot) { assert.equal(snapshot.debugTransitions, 0); assert.equal(snapshot.selection.difficulty, "normal"); assert.equal(snapshot.selection.weapon, "riftlock"); }
        // stop() hands back the ordinary frame loop; it does not erase retained
        // level controls. Real release events neutralize those without editing state.
        await page.getByRole("button", { name: "Stop", exact: true }).click(); await release();
        const passiveDeadline = Math.min(Date.now() + 60_000, deadline - 60_000);
        let screen;
        do {
          screen = await page.evaluate(() => window.__PANTHEON_TEST.state().game);
          if (screen === "gameover" || screen === "win") break;
          await page.waitForTimeout(100);
        } while (Date.now() < passiveDeadline);
        episode.terminalScreen = screen; episode.passiveTimedOut = screen !== "gameover" && screen !== "win";
        episode.actualTerminal = await page.evaluate(() => {
          const snapshot = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").captureSnapshot("r18-terminal-observation", "recorded-canonical");
          const run = snapshot.state["tear.run.v1"];
          return { wave: run.wave, score: run.score, time: run.runTime, difficulty: run.diff, weapon: run.weaponId, runUpgrades: run.mods.owned };
        });
        episode.recorderAtTerminal = await observeRecorder(); save();
        await page.screenshot({ path: path.join(directory, `run-${String(index + 1)}-terminal.png`) });
        if (episode.passiveTimedOut || screen !== "gameover") { save(); break; } // No forced outcome or replacement of an unfinished run.
        await page.evaluate(() => { window.__R18_TEXT__.length = 0; });
        await page.waitForFunction(() => window.__R18_TEXT__.some((entry) => entry.x === 80 && entry.y === 236 && /^\+\d+$/u.test(entry.text)));
        episode.renderedAward = await page.evaluate(() => window.__R18_TEXT__.findLast((entry) => entry.x === 80 && entry.y === 236 && /^\+\d+$/u.test(entry.text)));
        episode.runEarned = Number(episode.renderedAward.text.slice(1));
        episode.after = await settledStorage();
        episode.achievementGrants = Object.entries(episode.after.receipts).filter(([id]) => !Object.hasOwn(episode.before.receipts, id)).map(([id, coins]) => ({ id, coins }));
        episode.achievementCoins = episode.achievementGrants.reduce((sum, grant) => sum + grant.coins, 0);
        assert.equal(episode.after.earned - episode.before.earned, episode.runEarned + episode.achievementCoins, "wallet income must reconcile actual run reward and durable achievement receipts");
        assert.equal(episode.after.spent, 0); assert.deepEqual(episode.after.buy, {});
        report.earnedOnly += episode.runEarned; episode.earnedOnlyCumulative = report.earnedOnly;
        if (report.firstCrossingRun === null && report.earnedOnly >= 325) report.firstCrossingRun = index + 1;
        episode.completedAt = new Date().toISOString(); save();
        await clickText("MAIN MENU"); await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "menu");
      }
      const completedFour = report.episodes.length === 4 && report.episodes.every((episode) => episode.completedAt);
      if (completedFour && report.earnedOnly >= 325) {
        checkBudget(); const before = await settledStorage();
        await clickText("SHOP"); await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "shop");
        await clickText("325c");
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("tear_meta")).buy.tough === 1);
        const after = await settledStorage();
        assert.equal(after.spent - before.spent, 325); assert.deepEqual(after.buy, { tough: 1 });
        const purchaseGrants = Object.entries(after.receipts).filter(([id]) => !Object.hasOwn(before.receipts, id));
        assert.equal(after.earned - before.earned, purchaseGrants.reduce((sum, [, coins]) => sum + coins, 0));
        await page.screenshot({ path: path.join(directory, "toughness-purchased.png") });
        await boot(); const reloaded = await settledStorage();
        assert.deepEqual(reloaded, after, "ordinary saved balances, ranks, achievement receipts and profile stats must survive reload exactly");
        report.purchase = { before, after, reloaded, cost: 325, source: "normal rendered shop; no purchase before all four runs" };
      }
      report.acceptance = { completedFour: Boolean(completedFour), depthCohort: Boolean(completedFour) && report.episodes.every((episode) => episode.actualTerminal.wave >= 8 && episode.actualTerminal.wave <= 10),
        allWithinBudgets: Boolean(completedFour) && report.episodes.every((episode) => !episode.policyTimedOut && !episode.passiveTimedOut),
        earnedOnlyThreshold: report.earnedOnly >= 325, purchaseAndReload: report.purchase !== null,
        interpretation: "one controlled withdrawal-depth engineering cohort; not population pacing or physical-policy competence" };
      assert.deepEqual(errors, []); save();
      assert.ok(Object.entries(report.acceptance).filter(([, value]) => typeof value === "boolean").every(([, value]) => value), JSON.stringify(report.acceptance));
      console.log(`R18 controlled cohort retained: earned-only=${report.earnedOnly}, first crossing=${String(report.firstCrossingRun)}`);
    } catch (error) {
      report.errors.push(error.stack ?? String(error)); throw error;
    } finally {
      try { await preserveCapsules(); } catch (error) { report.capsulePreservationError = error.stack ?? String(error); }
      report.finishedAt = new Date().toISOString(); report.elapsedMs = Date.now() - started;
      save(); clearTimeout(ceiling);
    }
    return;
  }
  const url = new URL(page.url());
  url.searchParams.set("watchagent", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
  await page.getByLabel("Profile").selectOption("competent");
  await page.getByLabel("Mode").selectOption("campaign");
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.getByLabel("Weapon").selectOption("riftlock");
  await page.getByLabel("Journey").selectOption("longitudinal-earned-profile");
  await page.getByLabel("Seed").fill(String(baseSeed));
  await page.getByLabel("Max episodes").fill(String(maxEpisodes));
  await page.getByLabel("Max spend").fill(String(maxSpend));
  const navigationCountBefore = await page.evaluate(() =>
    performance.getEntriesByType("navigation").length);
  await page.getByRole("button", { name: "Start Watch Agent" }).click();

  let snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
  for (let batch = 0; batch < 2_000 && snapshot.status === "running"; batch += 1) {
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.runAsync(2_000));
  }
  const navigationCountAfter = await page.evaluate(() =>
    performance.getEntriesByType("navigation").length);
  const ledger = snapshot.longitudinal;
  assert.ok(ledger, "longitudinal journey must publish its earned-profile ledger");
  assert.equal(ledger.label, "longitudinal-earned-profile");
  assert.equal(ledger.policyId, "c24-credible-cheap-v1");
  assert.equal(ledger.maxEpisodes, maxEpisodes);
  assert.equal(ledger.maxSpend, maxSpend);
  assert.ok(ledger.episodes.length >= 1 && ledger.episodes.length <= maxEpisodes);
  assert.ok(ledger.purchases.length >= 1, "bounded real-UI loop must naturally earn and buy an upgrade");
  assert.ok(ledger.frozenCombatLevels, "terminal ledger must freeze the combat-affecting level vector");
  assert.ok(ledger.spent <= ledger.maxSpend);
  assert.equal(navigationCountAfter, navigationCountBefore, "earned progression must not reload the page");
  assert.ok(ledger.episodes.every((episode, index) =>
    episode.episode === index + 1
    && episode.seed === baseSeed + index
    && episode.walletAfter >= episode.walletBefore
    && episode.coinsEarned >= 0));
  assert.ok(ledger.purchases.every((purchase) =>
    purchase.levelAfter === purchase.levelBefore + 1
    && purchase.walletAfter <= purchase.walletBefore
    && purchase.cost > 0));
  assert.equal(snapshot.executionClass, "engineering");
  assert.equal(snapshot.observationClass, "privileged-diagnostic");
  assert.equal(snapshot.debugTransitions, 0);
  assert.equal(snapshot.certified, false);

  const artifact = {
    schemaVersion: 1,
    checkpoint: "C24",
    gate: "longitudinal-earned-profile-bounded-journey",
    label: "longitudinal-earned-profile",
    cleanProfileGate: "separate-and-unchanged",
    executionClass: "engineering",
    observationClass: "privileged-diagnostic",
    certified: false,
    controls: {
      startSurface: "visible Watch Agent panel",
      journeyTransitions: "currently rendered typed production ScreenAction controls",
      gameplayInput: "semantic GameAction at authoritative fixed ticks",
      currencyOrProfileInjection: false,
      agentDirectMetaCalls: false,
      debugStateWrites: 0,
      debugTransitions: snapshot.debugTransitions,
      pageReloadsDuringJourney: navigationCountAfter - navigationCountBefore,
    },
    ceilings: { maxEpisodes: ledger.maxEpisodes, maxSpend: ledger.maxSpend },
    ledger,
    result: snapshot,
    browserErrors: errors,
  };
  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c24");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  fs.writeFileSync(path.join(artifactDirectory, "longitudinal-earned-profile.json"),
    JSON.stringify(artifact, null, 2));
  await page.screenshot({ path: path.join(artifactDirectory, "longitudinal-earned-profile.png") });
  assert.deepEqual(errors, []);
  console.log("C24 bounded longitudinal earned-profile journey passed");
});
