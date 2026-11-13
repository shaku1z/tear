import { registerSW } from "virtual:pwa-register";
import { bootstrapTear } from "./bootstrap";
import { createStandaloneCloud } from "../platform/standalone-cloud";
import { PwaUpdateController } from "../platform/pwa-update";
import { browserIndexedDbForTestStorage } from "./test-browser-storage";

const pwaUpdate = new PwaUpdateController();

void bootstrapTear("standalone", async ({ surfaces, engineeringQuery }) => {
  const { composeTearApplication } = await import("../app/shell/composition");
  const browserIndexedDb = await browserIndexedDbForTestStorage();
  await composeTearApplication({ target: "standalone", createCloud: createStandaloneCloud, pwaUpdate, surfaces, engineeringQuery,
    ...(browserIndexedDb === undefined ? {} : { browserIndexedDb }) });
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  pwaUpdate.install(registerSW({
    immediate: true,
    onOfflineReady() {
      document.documentElement.dataset.offlineReady = "true";
    },
    onNeedRefresh() {
      document.documentElement.dataset.updateReady = "true";
      pwaUpdate.markReady();
    },
  }));
}
