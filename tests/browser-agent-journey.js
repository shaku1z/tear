const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "agent engineering journey", port: 8152 }, async ({ page, waitScreen, clickAndWait }) => {
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
  await page.mouse.click(430, 195); // Adventure
  await page.mouse.click(820, 197); // Easy
  await page.mouse.click(1180, 203); // Sword
  await page.mouse.click(800, 758); // Begin
  await transition("playing");
  await page.evaluate(() => window.__PANTHEON_TEST.skip());

  const hooks = await page.evaluate(() => Object.keys(window.__PANTHEON_TEST));
  assert.ok(hooks.includes("advanceAgentJourney"), "test build lacks the engineering journey hook");
  await page.evaluate(() => window.__PANTHEON_TEST.advanceAgentJourney("draft"));
  await transition("draft");
  await page.mouse.click(314, 300);
  await transition("playing");

  await page.evaluate(() => window.__PANTHEON_TEST.advanceAgentJourney("tier"));
  await transition("tierup");
  await page.mouse.click(314, 300);
  await transition("playing");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("campaignWin"));
  await transition("win");
  await page.evaluate(() => window.__PANTHEON_TEST.openReplay());
  await transition("replay");
  await page.mouse.click(1380, 856);
  await transition("menu");

  assert.deepEqual(evidence.transitions, [
    "menu", "setup", "playing", "draft", "playing", "tierup", "playing", "win", "replay", "menu",
  ]);
  assert.equal(evidence.certified, false, "engineering journeys must never be reported as black-box certified");
  console.log(JSON.stringify(evidence));
}).then(() => console.log("agent engineering journey passed"))
  .catch((error) => { console.error(error); process.exit(1); });
