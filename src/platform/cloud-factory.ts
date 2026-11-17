import type { CloudCompatibility, LegacyMetaPort, LegacyProfilePort } from "./cloud";
import type { PlatformServices, TearBuildTarget } from "./contracts";

export interface CloudFactoryOptions {
  readonly target: TearBuildTarget;
  readonly getPlatform: () => PlatformServices;
  readonly getProfile: () => LegacyProfilePort;
  readonly getMeta: () => LegacyMetaPort;
}

export type CloudFactory = (options: CloudFactoryOptions) => CloudCompatibility;
