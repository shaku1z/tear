import process from "node:process";
import { resolve } from "node:path";
import { RELEASE_REPOSITORY, verifyReleaseArtifact } from "./release-artifact.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const target = process.argv[2] || "standalone";
const directory = process.argv[3] ? resolve(process.argv[3]) : resolve(projectRoot, "dist", target);
const expectedSha = (process.env.TEAR_RELEASE_SHA || process.env.GITHUB_SHA || "").toLowerCase();
if (!/^[0-9a-f]{40}$/u.test(expectedSha)) throw new Error("TEAR_RELEASE_SHA or GITHUB_SHA must contain the full expected Git SHA");
const expectedRepository = process.env.TEAR_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || RELEASE_REPOSITORY;
const result = await verifyReleaseArtifact({
  directory,
  expectedRepository,
  expectedSha,
  expectedTarget: target,
});
console.log(`PASS release artifact: ${result.metadata.sha} ${result.artifact.hash}`);
