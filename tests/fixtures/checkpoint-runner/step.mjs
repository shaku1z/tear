// Test step for tests/run-checkpoint.test.mjs: `node step.mjs <label> [exitCode]`.
// Appends "<label>:<npm_lifecycle_event>" to the file named by CHECKPOINT_RUNNER_LOG, then exits with
// exitCode, or with CHECKPOINT_RUNNER_EXIT when no code is given (used when it stands in for pnpm).
import { appendFileSync } from "node:fs";

const [label, code = process.env.CHECKPOINT_RUNNER_EXIT ?? "0"] = process.argv.slice(2);
appendFileSync(process.env.CHECKPOINT_RUNNER_LOG, `${label}:${process.env.npm_lifecycle_event ?? ""}\n`);
process.exitCode = Number(code);
