const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const canonicalScenarios = require("../src/tearbench/canonical-scenarios.json");

const scenarios = canonicalScenarios.filter((entry) =>
  entry.subject.kind === "gameplay" || entry.subject.kind === "environment-field" || entry.subject.kind === "environment-combat-object");

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
      let evidence = {};
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
          const ownershipScenario = { ...scenario, id: `${scenario.id}.ownership`,
            start: { ...scenario.start, mode: "endless" } };
          initial = environment.reset(ownershipScenario);
          nextActionId = 1;
          const ownershipEvents = [];
          for (let tick = 0; tick < 240 && !(initial.diagnostics.waveOwnership === "source-events"
            && initial.diagnostics.livingWaveEnemies > 0); tick += 1) {
            const transition = step();
            ownershipEvents.push(...transition.events.map((event) => ({ type: event.type, payload: event.payload })));
            initial = transition.observation;
          }
          window.__PANTHEON_TEST.addUnownedWaveObserverActor();
          const withUnrelatedActor = environment.observe();
          const ownedAndUnrelated = withUnrelatedActor.diagnostics.waveOwnership === "source-events"
            && withUnrelatedActor.diagnostics.livingWaveEnemies > 0
            && withUnrelatedActor.entities.length > withUnrelatedActor.diagnostics.livingWaveEnemies;

          initial = environment.reset(scenario);
          nextActionId = 1;
          window.__PANTHEON_TEST.prepareNaturalWaveClearScenario();
          let cleared = false;
          let rewardReady = false;
          for (let tick = 0; tick < scenario.maxTicks && !rewardReady; tick += 1) {
            const transition = step();
            cleared ||= transition.events.some((event) => event.type === "wave.cleared"
              && event.source === "engine" && event.payload.wave === initial.run.wave);
            rewardReady = cleared && transition.observation.run.mode === scenario.start.mode
              && transition.observation.diagnostics.waveComplete
              && transition.observation.availableActions.includes("draft-choice");
          }
          evidence = {
            ownedAndUnrelated,
            ownershipEntities: withUnrelatedActor.entities.length,
            ownershipWaveOwnership: withUnrelatedActor.diagnostics.waveOwnership,
            ownershipLivingWaveEnemies: withUnrelatedActor.diagnostics.livingWaveEnemies,
            ownershipWave: withUnrelatedActor.run.wave,
            ownershipEvents,
            rewardReady,
          };
          proved = ownedAndUnrelated && rewardReady;
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
        case "variant-selection": {
          window.__PANTHEON_TEST.prepareVariantSelectionScenario("charger", "briar-stalker");
          const selected = environment.observe();
          const actor = selected.entities.find((entry) => entry.kind === "charger");
          proved = actor?.variantId === "briar-stalker" && actor.variantName === "Briar Stalker";
          evidence = { actor, selectionPath: "playground-explicit-spawn" };
          break;
        }
        case "generic-field": {
          const forge = environment.forgeEnvironmentField();
          if (!forge.ok) throw new Error("generic field must launch through State Forge restore");
          const env = environment.environment();
          const forgedState = env.snapshot();
          const fieldId = "generic-field-state";
          const transitions = [];
          for (let tick = 0; tick < 3; tick += 1) transitions.push(step());
          const finalField = env.snapshot().fields.find((entry) => entry.id === fieldId);
          proved = finalField?.state === "expired"
            && transitions.some((transition) => transition.events.some((event) => event.type === "world.environment-field-started"))
            && transitions.some((transition) => transition.events.some((event) => event.type === "world.environment-field-resolved"));
          evidence = { fieldId, forgedState, finalState: finalField?.state, transitionEvents: transitions.flatMap((transition) => transition.events.map((event) => event.type)) };
          break;
        }
        case "verdant-bloom-well": {
          const forge = environment.forgeBloomWellCycle();
          if (!forge.ok) throw new Error("Bloom Well must launch through State Forge restore");
          const env = environment.environment();
          const fieldId = "verdant-bloom-well";
          const states = [];
          const hashes = [];
          // This journey has no weapon command; verify the field did not alter the
          // weapon transport state machine or create a thrown route.
          const bladeBefore = { state: initial.blade.state };
          const capture = () => {
            const snapshot = env.snapshot();
            const field = snapshot.fields.find((entry) => entry.id === fieldId);
            if (field === undefined) throw new Error("Bloom Well State Forge restore did not produce the authored field");
            states.push(field.state); hashes.push(environment.stateHash());
            return field;
          };
          capture();
          for (let tick = 0; tick < 84; tick += 1) step();
          capture();
          for (let tick = 84; tick < 264; tick += 1) step();
          capture();
          for (let tick = 264; tick < 744; tick += 1) step();
          const finalField = capture();
          const finalObservation = environment.observe();
          const presentation = environment.bloomWellPresentation({ highContrast: true, reducedMotion: true, lowGraphics: true, audioEnabled: false })[0];
          const bladeAfter = { state: finalObservation.blade.state };
          const uniqueHashes = new Set(hashes);
          evidence = { states, hashes, forgedState: env.snapshot(), presentation, weaponTransportUnchanged: JSON.stringify(bladeBefore) === JSON.stringify(bladeAfter) };
          proved = states.join(",") === "warning,active,cooldown,dormant"
            && uniqueHashes.size === hashes.length && evidence.weaponTransportUnchanged
            && presentation?.boundaryVisible === true && presentation.highContrast === true
            && presentation.lowGraphics === true && presentation.motionScale === 0 && presentation.audioIndependent === true
            && finalField.state === "dormant";
          break;
        }
        case "generic-combat-object": {
          const forge = environment.forgeEnvironmentCombatObject();
          if (!forge.ok) throw new Error("generic combat object must launch through State Forge restore");
          const env = environment.environment();
          const objectId = "generic-combat-object-state";
          const before = env.snapshot().combatObjects.find((entry) => entry.id === objectId);
          const damage = env.damageCombatObject(objectId, 2, "generic-browser-attack", environment.observe().tick + 1);
          const transition = step();
          const after = env.snapshot().combatObjects.find((entry) => entry.id === objectId);
          proved = before?.integrity === 2 && damage.accepted && damage.destroyed && after?.state === "destroyed"
            && transition.events.some((event) => event.type === "world.environment-combat-object-damaged")
            && transition.events.some((event) => event.type === "world.environment-combat-object-destroyed");
          evidence = { objectId, beforeIntegrity: before?.integrity, afterState: after?.state, transitionEvents: transition.events.map((event) => event.type) };
          break;
        }
        case "verdant-root-network": {
          const forge = environment.forgeRootbinderNetwork();
          if (!forge.ok) throw new Error("Rootbinder network must launch through State Forge restore");
          const env = environment.environment();
          const initialObjects = env.snapshot().combatObjects.filter((object) => object.kind === "root-link");
          if (initialObjects.length !== 2 || initialObjects.some((object) => object.procEligible !== false)) {
            throw new Error("Rootbinder State Forge restore did not produce two non-proc root links");
          }
          const first = initialObjects[0];
          if (first === undefined) throw new Error("Rootbinder State Forge restore produced no link");
          const damage = env.damageCombatObject(first.id, 2, "root-network-browser-cut", environment.observe().tick + 1);
          step();
          const runtime = env;
          for (const object of runtime.snapshot().combatObjects) {
            if (object.state === "active") runtime.cleanupCombatObject(object.id, "defeat", environment.observe().tick);
          }
          const final = runtime.snapshot().combatObjects;
          const eventTypes = environment.events().map((event) => event.type).filter((type) => type.startsWith("world.environment-"));
          // State Forge restores pre-existing links; it must not fabricate a
          // causal link-created event. The live mutation chronology begins at
          // damage, proceeds to destruction, then cleans the surviving link.
          const damageIndex = eventTypes.indexOf("world.environment-combat-object-damaged");
          const destroyedIndex = eventTypes.indexOf("world.environment-combat-object-destroyed");
          const cleanedIndex = eventTypes.indexOf("world.environment-object-cleaned");
          const ordered = damageIndex >= 0 && destroyedIndex > damageIndex && cleanedIndex > destroyedIndex;
          evidence = { forgedState: runtime.snapshot(), initialObjects, damage, final, eventTypes, detachedBackend: "unsupported" };
          proved = damage.accepted && damage.destroyed && final.every((object) => object.state === "destroyed" || object.state === "expired")
            && final.every((object) => object.procEligible === false) && ordered;
          break;
        }
        case "rootbound-graft-anchor": {
          const forge = environment.forgeRootboundGraftAnchor();
          if (!forge.ok) throw new Error(`Rootbound Graft must launch through State Forge restore: ${JSON.stringify(forge)}`);
          const env = environment.environment();
          const beforeObservation = environment.observe();
          const boss = beforeObservation.entities.find((actor) => actor.kind === "rootbound");
          const graft = env.snapshot().combatObjects.find((object) => object.factoryId === "graft-anchor");
          if (boss === undefined || graft === undefined) throw new Error("Rootbound Graft restore did not retain its live boss owner");
          const scoreBefore = beforeObservation.run.score;
          const damage = env.damageCombatObject(graft.id, graft.integrity, "rootbound-graft-browser-cut", beforeObservation.tick + 1);
          const transition = step();
          env.cleanupCombatObject(graft.id, "boss-terminal", transition.observation.tick);
          step();
          const after = env.snapshot().combatObjects.find((object) => object.id === graft.id);
          const eventTypes = environment.events().map((event) => event.type);
          const damagedIndex = eventTypes.indexOf("world.environment-combat-object-damaged");
          const destroyedIndex = eventTypes.indexOf("world.environment-combat-object-destroyed");
          const cleanedIndex = eventTypes.indexOf("world.environment-object-cleaned");
          const finalObservation = environment.observe();
          evidence = { forge, graft, damage, after, bossId: boss.id, eventTypes,
            bossDamageableContract: "production-path-unit", scoreBefore, scoreAfter: finalObservation.run.score };
          proved = graft.ownerId === boss.id && graft.targetId === boss.id && graft.procEligible === false
            && graft.counterplayTags.includes("cut") && damage.accepted && damage.destroyed
            && after?.state === "expired" && after.cleanupReason === "boss-terminal"
            && damagedIndex >= 0 && destroyedIndex > damagedIndex && cleanedIndex > destroyedIndex
            && finalObservation.run.score === scoreBefore
            && !environment.events().some((event) => event.type === "enemy.defeated");
          break;
        }
        default: throw new Error(`no live scenario evidence exists for current gameplay subject ${source.subject.id}`);
      }
      const final = environment.observe();
      return { id: scenario.id, subject: scenario.subject.id, mode: final.run.mode, proved, evidence,
        initial: { x: initial.player.x, y: initial.player.y, grounded: initial.player.grounded },
        final: { x: final.player.x, y: final.player.y, grounded: final.player.grounded }, tick: final.tick };
    }, entry);
    assert.equal(receipt.mode, entry.start.mode, `${entry.id} must preserve its declared current run mode`);
    assert.equal(receipt.proved, true,
      `${entry.id} must execute its actual declared ${entry.subject.id} subject: ${JSON.stringify(receipt)}`);
  }
  console.log(`current live gameplay subjects passed (${scenarios.length} source-owned scenarios)`);
});
