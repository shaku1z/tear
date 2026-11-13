const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "agent engineering journey", port: 8152, recordFrames: true },
  async ({ page, waitScreen, clickAndWait, waitArmed, clickLabel, clickCard }) => {
  const evidence = {
    executionClass: "engineering",
    observationClass: "structured-state",
    transitions: [],
    certified: false,
  };
  const transition = async (screen) => {
    await waitScreen(screen);
    evidence.transitions.push(screen);
  };

  assert.equal((await page.evaluate(() => window.__PANTHEON_TEST.state().game)), "menu");
  evidence.transitions.push("menu");
  await clickAndWait(260, 360, "setup");
  evidence.transitions.push("setup");
  // A fresh profile is preselected onto the Tutorial, which hides difficulty;
  // choose each option where the setup screen drew it, as a player would.
  await clickLabel("ADVENTURE", "setup");
  await clickLabel("EASY", "setup");
  await clickLabel("SWORD", "setup");
  await clickLabel("START", "playing");
  evidence.transitions.push("playing");
  await page.evaluate(() => window.__PANTHEON_TEST.skip());

  const hooks = await page.evaluate(() => Object.keys(window.__PANTHEON_TEST));
  assert.ok(hooks.includes("advanceAgentJourney"), "test build lacks the engineering journey hook");
  await page.evaluate(() => window.__PANTHEON_TEST.advanceAgentJourney("draft"));
  await waitArmed("draft");
  evidence.transitions.push("draft");
  await clickCard(1, "playing");
  evidence.transitions.push("playing");

  await page.evaluate(() => window.__PANTHEON_TEST.advanceAgentJourney("tier"));
  await waitArmed("tierup");
  evidence.transitions.push("tierup");
  await clickCard(1, "playing");
  evidence.transitions.push("playing");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("campaignWin"));
  await transition("win");
  await page.evaluate(() => window.__PANTHEON_TEST.openReplay());
  await transition("replay");
  await clickAndWait(1380, 840, "menu");
  evidence.transitions.push("menu");

  assert.deepEqual(evidence.transitions, [
    "menu", "setup", "playing", "draft", "playing", "tierup", "playing", "win", "replay", "menu",
  ]);
  assert.equal(evidence.certified, false, "engineering journeys must never be reported as black-box certified");
  console.log(JSON.stringify(evidence));
}).then(() => console.log("agent engineering journey passed"))
  .catch((error) => { console.error(error); process.exit(1); });
