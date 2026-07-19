import { registerSW } from "virtual:pwa-register";
import { identifyBuild } from "./bootstrap";

identifyBuild("standalone");

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      document.documentElement.dataset.offlineReady = "true";
    },
    onNeedRefresh() {
      document.documentElement.dataset.updateReady = "true";
    },
  });
}
