import type { TearSdlDocumentV1 } from "./tearsdl";

/** Explicit Playground preview used to prove Pale without entering public progression. */
export const PALE_STAGE_ENGINEERING_TEARSDL: TearSdlDocumentV1 = Object.freeze({
  format: "tearsdl",
  schemaVersion: 1,
  id: "pale-stage-wave-41-engineering",
  stateClass: "reconstructed-reachable",
  seed: "pale-stage-wave-41",
  start: Object.freeze({
    mode: "playground",
    difficulty: "normal",
    weapon: "sword",
    stage: "pale-traverse",
    wave: 1,
  }),
  constraints: Object.freeze({
    legalProgression: false,
    paleComposition: Object.freeze({ profile: "entry", localWave: 1, provisional: true }),
  }),
  tags: Object.freeze([
    "pale-traverse",
    "stage",
    "presentation",
    "state-forge",
    "engineering-only",
    "non-publishable",
    "pt3-c5",
  ]),
  maxTicks: 1_440,
});
