const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "Ghost Vault conditional commit", port: 8203 }, async ({ page }) => {
  await page.waitForFunction(() => typeof window.__TEAR_GHOST_VAULT_CONDITIONAL__?.exercise === "function", undefined, { timeout: 15000 });
  const result = await page.evaluate(() => window.__TEAR_GHOST_VAULT_CONDITIONAL__.exercise("tear-ghost-conditional-commit-proof"));
  assert.deepEqual(result, { staleRefused: true, guard: "after", first: "one", second: "two", stale: undefined });
}).then(() => console.log("browser Ghost Vault conditional commit passed"))
  .catch((error) => { console.error(error); process.exit(1); });
