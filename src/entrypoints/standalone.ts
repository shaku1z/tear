import { registerSW } from "virtual:pwa-register";
import { bootstrapTear } from "./bootstrap";
import { createStandaloneCloud } from "../platform/standalone-cloud";
import { PwaUpdateController } from "../platform/pwa-update";

const pwaUpdate = new PwaUpdateController();

void bootstrapTear("standalone", async () => {
  const { composeTearApplication } = await import("../app/composition");
  composeTearApplication({ target: "standalone", createCloud: createStandaloneCloud, pwaUpdate });
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
