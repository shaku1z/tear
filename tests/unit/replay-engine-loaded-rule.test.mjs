// `tear/replay-engine-loaded` (scripts/eslint-rules/replay-engine-loaded.mjs): only the modules that work
// on a read capsule call replayEngine.loaded(), and no spelling of the call gets past the rule. ESLint
// runs it over every source file in `pnpm lint`; this replaces a unit test that searched the tree with
// git, whose process start alone timed it out on a loaded machine.
import { readFileSync } from "node:fs";
import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";

import { REPLAY_ENGINE_USERS, replayEngineLoaded } from "../../scripts/eslint-rules/replay-engine-loaded.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: "module" } });
const elsewhere = "C:/repo/src/app/replay/library.ts";
const flagged = (code, filename = elsewhere) => ({ code, filename, errors: [{ messageId: "onlyCapsuleModules" }] });
const call = "const composition = replayEngine.loaded().createProductionGhostReplayComposition({});";

tester.run("tear/replay-engine-loaded", replayEngineLoaded, {
  valid: [
    { code: call, filename: "C:/repo/src/ghost/live-ghost-reference.ts" },
    { code: call, filename: "C:/repo/src/ghost/production-replay-session.ts" },
    { code: call, filename: "C:\\repo\\src\\ghost\\production-replay-verification.ts" },
    { code: "export const loaded = () => replayEngine.loaded();", filename: "C:/repo/src/ghost/replay-engine.ts" },
    { code: call, filename: "C:/repo/src/tearbench/tutorial-gold-generation.ts" },
    { code: call, filename: "C:/repo/src/tearbench/live-detached-parity-matrix.ts" },
    { code: "await replayEngine.ensure();", filename: elsewhere },
    { code: "const loaded = other.loaded();", filename: elsewhere },
    { code: "const { ensure } = replayEngine;", filename: elsewhere },
  ],
  invalid: [
    flagged(call),
    flagged('replayEngine["loaded"]();'),
    flagged("const { loaded } = replayEngine;"),
    flagged("const run = replayEngine.loaded;"),
    flagged(call, "C:/repo/src/ghost/capsule-reader.ts"),
  ],
});

// The users outside src/ghost run only under vitest, where the slot is the eager engine. Release code may
// not import them: the release.developer-only role makes the architecture gate and the release build fail.
describe("replay engine users outside the capsule modules", () => {
  it("are developer-only modules", () => {
    const roles = JSON.parse(readFileSync("config/architecture-roles.json", "utf8")).roles;
    const developerOnly = roles["release.developer-only"].include;
    const outsideGhost = REPLAY_ENGINE_USERS.filter((path) => !path.startsWith("/src/ghost/"));
    expect(outsideGhost.length).toBeGreaterThan(0);
    for (const path of outsideGhost) expect(developerOnly).toContain(path.slice(1));
  });
});
