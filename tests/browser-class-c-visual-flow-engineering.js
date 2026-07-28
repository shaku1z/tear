/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser engineering script. */
/**
 * Engineering-only visual-flow exercise.  The test harness prepares a draft
 * and terminal after real play has started, but the external policy sees only
 * screenshots and emits only trusted keyboard/mouse events.  This develops the
 * visible draft/terminal path without presenting debug setup as Class-C proof.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { createClassCControls, writeClassCArtifact } = require("./class-c-browser-harness");
const { decodePng } = require("./class-c-png");

async function main() {
  const inputProfile = process.argv.includes("--touch") ? "touch" : "keyboard-mouse";
  const { createServer } = await import("vite");
  const observerServer = await createServer({ root: path.resolve(__dirname, ".."), server: { middlewareMode: true } });
  const { TearPixelTemporalTracker } = await observerServer.ssrLoadModule("/src/agents/pixel-observation.ts");
  const { TearClassCVisualPolicy } = await observerServer.ssrLoadModule("/src/agents/black-box-policy.ts");
  const record = {
    format: "tear-c25-visual-flow-engineering", version: 1,
    executionClass: "engineering", observationClass: "pixel-only", physicalInput: inputProfile, certified: false,
    limitations: ["Test-only debug prepares draft and terminal states; this is not a clean Class-C attempt."],
    inputs: [], frames: [], browserErrors: [], result: "incomplete",
  };
  try {
    await withJourney({ name: "C25 engineering visual draft and terminal flow", port: 8166 }, async ({ page, waitScreen, errors }) => {
      const controls = createClassCControls(page, { width: 1600, height: 900 }, record);
      const tracker = new TearPixelTemporalTracker({ logicalWidth: 1600, logicalHeight: 900, maximumFrames: 4 });
      const policy = new TearClassCVisualPolicy(inputProfile);
      const observe = async (name) => tracker.observe(decodePng(await controls.screenshot(name)));
      const observeStable = async (name) => {
        let last;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const result = await observe(`${name}-${String(attempt)}`);
          last = result;
          if (!result.occluded && result.observation.confidence >= 0.5) return result;
          await controls.wait(160);
        }
        throw new Error(`visual flow never received a usable ${name} frame (last=${last?.observation.kind ?? "none"}, confidence=${String(last?.observation.confidence ?? 0)}, occluded=${String(last?.occluded ?? false)})`);
      };
      const enact = async (intents) => {
        for (const intent of intents) {
          if (intent.type === "key") {
            await controls.key(intent.code, intent.phase);
            // A trusted keydown must span at least one render turn so a real
            // production UI loop can observe it; a zero-duration synthetic
            // pulse is not representative physical keyboard input.
            if (intent.phase === "down") await controls.wait(34);
          }
          else if (intent.type === "pointer") await controls.pointer({ x: intent.x, y: intent.y }, intent.phase === "move" ? "move" : intent.phase, intent.button === 0 ? "left" : intent.button === 1 ? "middle" : "right");
          else if (intent.type === "touch") await controls.touch({ x: intent.x, y: intent.y }, intent.phase);
          else throw new Error("visual-flow policy emitted an unsupported physical gesture");
        }
      };

      await controls.wait(700);
      await enact(policy.decide(await observe("menu")).intents);
      await controls.wait(400);
      if (inputProfile === "touch") {
        // Touch menu activation and terminal return are exercised against real
        // pixels and touch events. Draft selection remains an explicit future
        // policy task because the touch playfield composition is distinct.
        await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
        await waitScreen("gameover");
        const terminalDecision = policy.decide(await observeStable("touch-terminal"));
        assert.equal(terminalDecision.reason, "visible-terminal-touch-menu-affordance");
        await enact(terminalDecision.intents);
        await waitScreen("menu");
        await controls.wait(350);
        const returnDecision = policy.decide(await observeStable("touch-menu-return"));
        assert.equal(returnDecision.reason, "visible-menu-return-complete");
        record.browserErrors.push(...errors);
        assert.deepEqual(record.browserErrors, [], `C25 touch terminal browser errors: ${record.browserErrors.join("\n")}`);
        record.result = "physical-visual-touch-terminal-menu-return-engineering";
        return;
      }
      for (let index = 0; index < 4; index += 1) {
        await enact(policy.decide(await observe(`setup-${String(index)}`)).intents);
        await controls.wait(150);
      }
      await waitScreen("playing");
      const playingDecision = policy.decide(await observeStable("playing"));
      assert.equal(playingDecision.stage, "playing", `visible setup did not reach the pixel policy's playing stage: ${playingDecision.reason}`);
      await enact(playingDecision.intents);
      // Preparation is intentionally outside the policy. From this point on,
      // screenshots and normal physical events are the only policy interface.
      // Keep this fixture on the direct draft-to-gameplay branch.  Reserve is
      // separately covered by the existing progression journey; it is not a
      // visible state the current black-box policy claims to solve yet.
      await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 2, reserve: false }));
      await waitScreen("draft");
      const draftDecision = policy.decide(await observeStable("draft"));
      assert.equal(draftDecision.reason, "visible-draft-like-affordance");
      await enact(draftDecision.intents);
      await waitScreen("playing");
      await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
      await waitScreen("gameover");
      const terminalDecision = policy.decide(await observeStable("terminal"));
      assert.equal(terminalDecision.reason, inputProfile === "touch" ? "visible-terminal-touch-menu-affordance" : "visible-terminal-keyboard-menu-navigation");
      await enact(terminalDecision.intents);
      await waitScreen("menu");
      // The terminal action changes the screen immediately, while the visible
      // menu composition still finishes its entrance. Observe a settled frame
      // instead of treating a transition frame as the final menu proof.
      await controls.wait(350);
      const returnDecision = policy.decide(await observeStable("menu-return"));
      assert.equal(returnDecision.reason, "visible-menu-return-complete");
      record.browserErrors.push(...errors);
      assert.deepEqual(record.browserErrors, [], `C25 visual-flow browser errors: ${record.browserErrors.join("\n")}`);
      record.result = "physical-visual-draft-terminal-menu-return-engineering";
    });
  } finally {
    writeClassCArtifact("visual-flow-engineering", record);
    await observerServer.close();
  }
  console.log(`C25 test-only ${inputProfile === "touch" ? "touch terminal/menu" : "keyboard/mouse draft/terminal/menu"} physical flow passed (engineering-only, non-certifying)`);
}

main().catch((error) => { console.error(error); process.exit(1); });
