// `tear/replay-engine-loaded` (scripts/eslint-rules/replay-engine-loaded.mjs): only the modules that work
// on a read capsule call replayEngine.loaded(), and no spelling of the call gets past the rule. ESLint
// runs it over every source file in `pnpm lint`; this replaces a unit test that searched the tree with
// git, whose process start alone timed it out on a loaded machine.
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { replayEngineLoaded } from "../../scripts/eslint-rules/replay-engine-loaded.mjs";

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
