import { createCloudCompatibility } from "./cloud";
import type { CloudFactory } from "./cloud-factory";
import { createPlatformSharedCloud } from "./platform-shared-cloud";

/** Portal-only cloud graph backed by platform capabilities, with no Firebase code. */
export const createCrazyGamesCloud: CloudFactory = (options) => createCloudCompatibility({
  ...options,
  shared: createPlatformSharedCloud(options.getPlatform),
});
