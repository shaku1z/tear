// The player journeys on the test build, run as one suite in one process: one build check, one
// local server and one browser, with a fresh browser context for every journey.
// Each file still runs on its own too, for example `node tests/browser-terminal-journeys.js`.
//
//   node tests/browser-journeys.js            (needs dist/test-standalone: pnpm build:test:standalone)
const path = require("node:path");
const { runJourneySuite } = require("./browser-journey-harness");

const JOURNEYS = [
  // Main menu, every hub screen, every mode from the setup screen (tutorial included), pause and quit.
  "browser-navigation-journeys.js",
  // Draft, tier-up, shop, codex, profile, achievements, leaderboards, replay controls, rename.
  "browser-progression-journeys.js",
  // Playground hotkeys, tools, enemy spawns, Ability Lab and build menu.
  "browser-playground-journeys.js",
  // Game over, continue, win and campaign win, with RETRY, MAIN MENU, GIVE UP and PLAY AGAIN.
  "browser-terminal-journeys.js",
  // Full, brief and off cinematic preferences on a campaign start.
  "browser-cinematic-preferences.js",
  // A saved Head Start upgrade applies to a fresh run.
  "browser-fresh-run-meta-progression.js",
  // Adventure from the menu through drafts, a campaign win and the replay screen.
  "browser-agent-journey.js",
];

runJourneySuite(JOURNEYS.map((file) => path.join(__dirname, file)))
  .then(() => console.log(`browser journeys passed (${String(JOURNEYS.length)} journeys)`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
