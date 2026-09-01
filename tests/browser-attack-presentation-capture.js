/* eslint-disable @typescript-eslint/no-require-imports -- browser evidence is executed directly by Node. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const output = path.resolve(__dirname, "..", "artifacts", "tearbench", "generated", "attack-presentation");
const captures = [
  { weapon: "sword", variant: "threadcut" },
  { weapon: "hammer", variant: "meteor" },
  { weapon: "greatsword", variant: "wheelCut" },
  { weapon: "chainblade", variant: "sling" },
  { weapon: "riftlock", variant: "backblastRound" },
];
const policies = [
  { id: "default", settings: { reducedMotion: false, highContrast: false, gfx: "high" } },
  { id: "low-graphics", settings: { reducedMotion: false, highContrast: false, gfx: "low" } },
  { id: "reduced-motion", settings: { reducedMotion: true, highContrast: false, gfx: "high" } },
  { id: "high-contrast", settings: { reducedMotion: false, highContrast: true, gfx: "high" } },
];

function resolvedScenario(weapon) {
  return Object.freeze({
    document: Object.freeze({
      format: "tearsdl", schemaVersion: 1, id: `attack-presentation.${weapon}`,
      stateClass: "reconstructed-reachable", seed: `attack-presentation-${weapon}`,
      start: Object.freeze({ mode: "endless", difficulty: "normal", weapon }),
      state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }),
        enemyComposition: Object.freeze([Object.freeze({ kind: "charger", count: 1, x: 400, y: 620 })]) }),
      constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["attack-presentation", weapon]), maxTicks: 720,
    }),
    scenario: Object.freeze({
      format: "tear-contract", kind: "scenario", schemaVersion: 1, id: `attack-presentation.${weapon}`, version: 1,
      description: `${weapon} signature presentation capture`, stateClass: "reconstructed-reachable", executionClass: "engineering",
      seed: `attack-presentation-${weapon}`, start: Object.freeze({ mode: "endless", difficulty: "normal", weapon, wave: 1 }),
      maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health"]), tags: Object.freeze(["attack-presentation", weapon]),
    }),
    structural: Object.freeze({ valid: true, issues: Object.freeze([]) }),
    reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
    plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }),
    resolvedHash: `attack-presentation-${weapon}`,
  });
}

withJourney({ name: "Final Five attack presentation capture", port: 8314 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  fs.mkdirSync(output, { recursive: true });
  const build = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "dist", "test-standalone", "build-info.json"), "utf8"));
  const manifest = [];
  for (const policy of policies) {
    await page.evaluate((settings) => window.__PANTHEON_TEST.setOptions(settings), policy.settings);
    const activePolicy = await page.evaluate(() => {
      const state = window.__PANTHEON_TEST.state();
      return { reducedMotion: state.reducedMotion, highContrast: state.highContrast, lowGraphics: state.lowEffects };
    });
    const policyOutput = policy.id === "default" ? output : path.join(output, policy.id);
    fs.mkdirSync(policyOutput, { recursive: true });
    for (const capture of captures) {
      const result = await page.evaluate(({ scenario, capture }) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        const launched = environment.forgeResolvedScenario(scenario);
        if (!launched.ok) return { launched, reached: false };
        let id = 1;
        const command = (value) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command: value }]);
        const advance = () => environment.advanceApplicationFrame(1 / 120);
        const runLog = () => environment.captureSnapshot("attack-presentation-probe").state["tear.run.v1"].weaponLog;
        while (environment.observe().tick < 56) advance();
        command({ type: "aim", turn: 500000, magnitude: 1000 });
        command({ type: "weapon", intent: "throw", phase: "pressed" });
        let reached = false;
        for (let frame = 0; frame < 360 && !reached; frame += 1) {
          advance();
          if (capture.weapon === "sword") {
            if (runLog().some((entry) => entry.type === "throwHit" && entry.secondary === false)) {
              command({ type: "weapon", intent: "recall", phase: "pressed" });
              for (let recall = 0; recall < 360; recall += 1) {
                advance();
                if (runLog().some((entry) => entry.mechanic === "threadcut" && entry.secondary === true)) { reached = true; break; }
              }
            }
          } else if (capture.weapon === "chainblade" && environment.observe().blade.state === "hooked") {
            command({ type: "weapon", intent: "recall", phase: "pressed" }); advance(); reached = true;
          } else if (capture.weapon === "riftlock" && environment.observe().blade.state === "captured") {
            command({ type: "weapon", intent: "recall", phase: "pressed" }); advance(); reached = true;
          } else if (capture.weapon === "greatsword" && environment.observe().blade.state === "embedded") reached = true;
          else if (runLog().some((entry) => entry.mechanic === capture.variant)) reached = true;
        }
        window.__TEAR_ATTACK_CAPTURE_ENVIRONMENT__ = environment;
        return { launched, reached, tick: environment.observe().tick };
      }, { scenario: resolvedScenario(capture.weapon), capture });
      assert.equal(result.launched.ok, true, JSON.stringify(result));
      assert.equal(result.reached, true, `${policy.id} ${capture.weapon} did not reach ${capture.variant}`);
      const file = `${capture.weapon}-${capture.variant}.png`;
      await page.screenshot({ path: path.join(policyOutput, file) });
      manifest.push({ policy: policy.id, weapon: capture.weapon, variant: capture.variant, file: path.relative(output, path.join(policyOutput, file)),
        tick: result.tick, settings: activePolicy, viewport: { width: 1600, height: 900, dpr: 1 }, resolvedHash: `attack-presentation-${capture.weapon}` });
      await page.evaluate(() => { window.__TEAR_ATTACK_CAPTURE_ENVIRONMENT__?.terminate(); delete window.__TEAR_ATTACK_CAPTURE_ENVIRONMENT__; });
    }
  }
  fs.writeFileSync(path.join(output, "evidence.json"), `${JSON.stringify({
    format: "tear-grounded-attack-presentation-evidence", schemaVersion: 1, engineeringOnly: true,
    certifying: false, build, captures: manifest,
  }, null, 2)}\n`);
  console.log(`Final Five grounded attack presentation captures passed (${manifest.length}): ${output}`);
});
