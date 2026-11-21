import { isRecord } from "../domain/records";
import { RUN_RANDOM_STREAM_NAMES } from "../simulation/run-random";
import type { ProductionReplayBootstrap } from "../gameplay/snapshot/snapshot-contract";

/** Checks an untrusted checkpoint bootstrap (build identity, random streams, frame policy) and returns a frozen copy. */
export function requireProductionReplayBootstrap(value: unknown): ProductionReplayBootstrap {
  if (!isRecord(value) || !isRecord(value.build) || !isRecord(value.rng)) {
    throw new TypeError("production headless checkpoint bootstrap is invalid");
  }
  const build = value.build;
  const policy = value.applicationFramePolicy;
  if (
    policy !== undefined &&
    (!isRecord(policy) ||
      policy.version !== 1 ||
      policy.kind !== "generated-step-intro" ||
      policy.secondsPerStep !== 1 / 120 ||
      Object.keys(policy).some((key) => !["version", "kind", "secondsPerStep"].includes(key)))
  )
    throw new TypeError("unsupported generated application-frame policy");
  const buildKeys = ["version", "revision", "target", "rulesetVersion", "contentHash", "configHash"] as const;
  if (buildKeys.some((key) => typeof build[key] !== "string" || build[key].length === 0)) {
    throw new TypeError("production headless checkpoint build identity is invalid");
  }
  const streams: Record<
    string,
    Readonly<{ algorithm: "mulberry32"; seed: number; state: number; cursor: number }>
  > = {};
  for (const name of RUN_RANDOM_STREAM_NAMES) {
    const stream = value.rng[name];
    if (
      !isRecord(stream) ||
      stream.algorithm !== "mulberry32" ||
      typeof stream.seed !== "number" ||
      !Number.isSafeInteger(stream.seed) ||
      stream.seed < 0 ||
      typeof stream.state !== "number" ||
      !Number.isSafeInteger(stream.state) ||
      stream.state < 0 ||
      typeof stream.cursor !== "number" ||
      !Number.isSafeInteger(stream.cursor) ||
      stream.cursor < 0
    ) {
      throw new TypeError("production headless checkpoint random bootstrap is invalid");
    }
    streams[name] = Object.freeze({
      algorithm: "mulberry32",
      seed: stream.seed,
      state: stream.state,
      cursor: stream.cursor,
    });
  }
  return Object.freeze({
    build: Object.freeze({
      version: build.version as string,
      revision: build.revision as string,
      target: build.target as string,
      rulesetVersion: build.rulesetVersion as string,
      contentHash: build.contentHash as string,
      configHash: build.configHash as string,
    }),
    rng: Object.freeze(streams),
    ...(policy === undefined
      ? {}
      : {
          applicationFramePolicy: Object.freeze({
            version: 1 as const,
            kind: "generated-step-intro" as const,
            secondsPerStep: 1 / 120,
          }),
        }),
  });
}
