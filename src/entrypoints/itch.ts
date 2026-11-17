import { bootstrapTear } from "./bootstrap";
import { createCloudCompatibility } from "../platform/cloud";
import type { CloudFactory } from "../platform/cloud-factory";
import { createPlatformSharedCloud } from "../platform/platform-shared-cloud";
import { unavailablePwaUpdate } from "../platform/pwa-update";

/**
 * itch.io upload: the game runs in itch's iframe from its own CDN, so it keeps
 * progress in the browser's local storage and uses no accounts, portal SDK,
 * service worker or other external service.
 */
const createLocalCloud: CloudFactory = (options) =>
  createCloudCompatibility({ ...options, shared: createPlatformSharedCloud(options.getPlatform) });

void bootstrapTear("itch", async ({ surfaces, engineeringQuery }) => {
  const { composeTearApplication } = await import("../app/shell/composition");
  composeTearApplication({
    target: "itch",
    surfaces,
    engineeringQuery,
    createCloud: createLocalCloud,
    pwaUpdate: unavailablePwaUpdate,
  });
});
