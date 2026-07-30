import type { PlatformServices } from "../platform/contracts";
import { unavailable } from "../platform/contracts";
import { createLifecycleController } from "../platform/lifecycle";
import { createMemoryStorage } from "../platform/storage";
import { RunRandomStreams, type RunRandomStreamName } from "../simulation/run-random";

export interface TearTestWriteAttempt {
  readonly capability: "cloud" | "leaderboard" | "achievement" | "analytics" | "advertisement";
  readonly operation: string;
}

export interface TearTestEnvironment {
  readonly platform: PlatformServices;
  readonly random: RunRandomStreams;
  readonly writes: readonly TearTestWriteAttempt[];
  reset(seed: number | string): void;
  stream(name: RunRandomStreamName): ReturnType<RunRandomStreams["stream"]>;
}

/**
 * Disposable environment used by engineering and training runners. Remote
 * capabilities are unavailable by construction and storage lives only in memory.
 */
export function createTearTestEnvironment(seed: number | string = 1): TearTestEnvironment {
  const settingsStorage = createMemoryStorage();
  const profileStorage = createMemoryStorage();
  const lifecycle = createLifecycleController({ focused: true, visible: true });
  const writes: TearTestWriteAttempt[] = [];
  const random = new RunRandomStreams();
  random.reset(seed);
  const platform: PlatformServices = Object.freeze({
    id: "tearbench",
    lifecycle,
    settingsStorage,
    profileStorage,
    identity: unavailable("TearBench uses no player identity."),
    cloudSave: unavailable("TearBench cloud writes are disabled."),
    leaderboards: unavailable("TearBench leaderboard writes are disabled."),
    ads: unavailable("TearBench advertisements are disabled."),
    achievements: unavailable("TearBench achievement writes are disabled."),
    analytics: unavailable("TearBench analytics are disabled."),
    fullscreen: unavailable("TearBench fullscreen is controlled by its runner."),
    overlay: unavailable("TearBench external overlays are disabled."),
  });
  return Object.freeze({
    platform,
    random,
    get writes() { return Object.freeze([...writes]); },
    reset(nextSeed: number | string) {
      random.reset(nextSeed);
      writes.length = 0;
    },
    stream(name: RunRandomStreamName) { return random.stream(name); },
  });
}
