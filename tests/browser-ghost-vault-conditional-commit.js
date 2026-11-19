const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

withJourney({ name: "Ghost Vault conditional commit" }, async ({ page }) => {
  await page.waitForFunction(() => typeof window.__TEAR_GHOST_VAULT_CONDITIONAL__?.exercise === "function", undefined, {
    timeout: STATE_WAIT_MS,
  });
  const result = await page.evaluate(() =>
    window.__TEAR_GHOST_VAULT_CONDITIONAL__.exercise("tear-ghost-conditional-commit-proof"),
  );
  assert.deepEqual(result, {
    staleRefused: true,
    nonStringRefused: true,
    journalGuardRefused: true,
    nonStringPreserved: true,
    guard: "after",
    first: "one",
    second: "two",
    stale: undefined,
    corruptPartial: undefined,
    journalPartial: undefined,
  });
})
  .then(() => console.log("browser Ghost Vault conditional commit passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
