const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const canonicalScenarios = require("../src/tearbench/canonical-scenarios.json");

const scenarios = canonicalScenarios.filter((entry) => entry.subject.kind === "gameplay");

withJourney({ name: "current canonical gameplay scenario subjects", port: 8298 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__PANTHEON_TEST);
  for (const entry of scenarios) {
    assert.ok(entry.backends.includes("live"), `${entry.id} must honestly declare its live evidence backend`);
    const receipt = await page.evaluate((source) => {
      const scenario = {
        format: "tear-contract", kind: "scenario", schemaVersion: 1,
        id: source.id, version: 1, description: source.description,
        stateClass: "recorded-canonical", executionClass: "engineering",
        subject: source.subject, backends: source.backends, seed: `current-live-${source.subject.id}`,
        start: source.start, maxTicks: source.maxTicks, assertions: ["runtime.finite-state"], tags: source.tags,
      };
      const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
      let initial = environment.reset(scenario);
      let nextActionId = 1;
      const step = (...commands) => environment.step(commands.map((command) => ({
        kind: "command", id: nextActionId++, tick: environment.observe().tick + 1, command,
      })));
      let proved = false;
      switch (source.subject.id) {
        case "boot": {
          const transition = step();
          proved = transition.events.some((event) => event.type === "run.started" && event.source === "engine")
            && transition.observation.run.mode === scenario.start.mode;
          break;
        }
        case "movement": {
          window.__PANTHEON_TEST.prepareCurrentGameplayScenario();
          initial = environment.observe();
          const transition = step({ type: "move", x: 1000, y: 0 }, { type: "jump", phase: "pressed" });
          proved = transition.actions.some((action) => action.command.type === "jump")
            && transition.observation.player.y < initial.player.y;
          break;
        }
        case "dash": {
          window.__PANTHEON_TEST.prepareCurrentGameplayScenario();
          initial = environment.observe();
          const transition = step({ type: "dash", x: 1000, y: 0 });
          proved = (transition.observation.player.dashTimer || 0) > 0
            && transition.observation.player.x !== initial.player.x;
          break;
        }
        case "blade": {
          window.__PANTHEON_TEST.prepareCurrentGameplayScenario();
          window.__PANTHEON_TEST.prepareCombatParityScenario();
          initial = environment.observe();
          const target = initial.entities.find((actor) => actor.kind !== "projectile");
          if (target === undefined) throw new Error("current blade scenario has no source-owned damage target");
          const radians = Math.atan2(target.y - initial.blade.handY, target.x - initial.blade.handX);
          const targetTurn = Math.round((((radians / (Math.PI * 2)) % 1 + 1) % 1) * 1000000) % 1000000;
          for (let tick = 0; tick < 30 && !proved; tick += 1) {
            const transition = tick === 0
              ? step({ type: "aim", turn: targetTurn, magnitude: 1000 },
                { type: "weapon", intent: "throw", phase: "pressed" })
              : step();
            proved = transition.events.some((event) => event.type === "enemy.defeated")
              || transition.observation.entities.some((actor) => {
                const before = initial.entities.find((candidate) => candidate.id === actor.id);
                return before && actor.hpRatio < before.hpRatio;
              });
          }
          break;
        }
        case "parry": {
          window.__PANTHEON_TEST.prepareCurrentGameplayScenario();
          step({ type: "aim", turn: 840000, magnitude: 1000 });
          window.__PANTHEON_TEST.prepareProjectileParryScenario();
          initial = environment.observe();
          for (let tick = 0; tick < 30 && !proved; tick += 1) {
            const transition = step();
            proved = transition.events.some((event) =>
              event.type === "projectile.deflected" || event.type === "combat.perfect-parry");
          }
          break;
        }
        case "wave": {
          window.__PANTHEON_TEST.prepareNaturalWaveClearScenario();
          let cleared = false;
          for (let tick = 0; tick < scenario.maxTicks && !proved; tick += 1) {
            const transition = step();
            cleared ||= transition.events.some((event) => event.type === "wave.cleared"
              && event.source === "engine" && event.payload.wave === initial.run.wave);
            proved = cleared && transition.observation.run.mode === scenario.start.mode
              && transition.observation.diagnostics.waveComplete
              && transition.observation.availableActions.includes("draft-choice");
          }
          break;
        }
        case "draft": {
          window.__PANTHEON_TEST.openDraft({ preserveRun: true, reserve: false });
          const draft = environment.observe();
          const choiceId = draft.diagnostics.ui.focusableIds[0];
          if (typeof choiceId !== "string") throw new Error("current draft has no source-owned selectable choice");
          const transition = step({ type: "draft-choice", choiceId });
          proved = transition.actions[0]?.command.type === "draft-choice"
            && environment.observe().availableActions.includes("move");
          break;
        }
        default: throw new Error(`no live scenario evidence exists for current gameplay subject ${source.subject.id}`);
      }
      const final = environment.observe();
      return { id: scenario.id, subject: scenario.subject.id, mode: final.run.mode, proved,
        initial: { x: initial.player.x, y: initial.player.y, grounded: initial.player.grounded },
        final: { x: final.player.x, y: final.player.y, grounded: final.player.grounded }, tick: final.tick };
    }, entry);
    assert.equal(receipt.mode, entry.start.mode, `${entry.id} must preserve its declared current run mode`);
    assert.equal(receipt.proved, true,
      `${entry.id} must execute its actual declared ${entry.subject.id} subject: ${JSON.stringify(receipt)}`);
  }
  console.log(`current live gameplay subjects passed (${scenarios.length} source-owned scenarios)`);
});
