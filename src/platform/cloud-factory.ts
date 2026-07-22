import type { CloudCompatibility, LegacyMetaPort, LegacyProfilePort } from "./cloud";
import type { PlatformServices } from "./contracts";

export interface CloudFactoryOptions {
  readonly target: "standalone" | "crazygames";
  readonly getPlatform: () => PlatformServices;
  readonly getProfile: () => LegacyProfilePort;
  readonly getMeta: () => LegacyMetaPort;
}

export type CloudFactory = (options: CloudFactoryOptions) => CloudCompatibility;
