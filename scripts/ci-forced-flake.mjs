// TEMPORARY, removed by the next commit: fails on a run's first attempt and passes on a re-run, to
// show the flaky report on a single browser shard re-run (pull request #188, condition 6).
import process from "node:process";

const attempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
console.log(`forced flake: attempt ${attempt}`);
process.exitCode = attempt === "1" ? 1 : 0;
