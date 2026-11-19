// `tear/one-record-guard` (scripts/eslint-rules/one-record-guard.mjs): only src/domain/records.ts compares
// typeof with "object", and no spelling of the comparison gets past the rule.
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { oneRecordGuard } from "../../scripts/eslint-rules/one-record-guard.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: "module" } });
const anywhere = "C:/repo/src/gameplay/example.ts";
const owner = "C:/repo/src/domain/records.ts";
const flagged = (code) => ({ code, filename: anywhere, errors: [{ messageId: "useRecords" }] });

tester.run("tear/one-record-guard", oneRecordGuard, {
  valid: [
    { code: 'const ok = typeof value === "object" && value !== null;', filename: owner },
    { code: 'const ok = typeof value === "string" || typeof value === "number";', filename: anywhere },
    { code: 'const ok = isRecord(value) && kind === "object";', filename: anywhere },
    { code: 'switch (typeof value) { case "string": break; }', filename: anywhere },
    { code: 'switch (kind) { case "object": break; }', filename: anywhere },
  ],
  invalid: [
    flagged('if (typeof value === "object") run();'),
    flagged('if (typeof value == "object") run();'),
    flagged('if (typeof value !== "object") run();'),
    flagged('if (typeof value != "object") run();'),
    flagged('if ("object" === typeof value) run();'),
    flagged('if ("object" !== typeof value) run();'),
    flagged("if (typeof value === `object`) run();"),
    flagged('if (typeof entry.payload === "object" && entry.payload !== null) run();'),
    flagged('switch (typeof value) { case "object": break; }'),
    flagged('const kind = { ok: typeof value === "object" };'),
    { code: 'if (typeof value === "object") run();', filename: "C:\\repo\\src\\ghost\\reader.ts", errors: 1 },
  ],
});
