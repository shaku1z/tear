import {
  available,
  unavailable,
  type FullscreenService,
  type OverlayService,
  type PlatformServices,
} from "./contracts";
import { createLifecycleController } from "./lifecycle";
import { createSafeStorage, type SyncStringStorage } from "./storage";

interface BrowserWindowLike {
  readonly localStorage?: SyncStringStorage;
  readonly document?: BrowserDocumentLike;
  readonly closed?: boolean;
  addEventListener?(type: "focus" | "blur", listener: () => void): void;
  open?(url: string, target?: string, features?: string): BrowserWindowLike | null;
}

interface BrowserDocumentLike {
  readonly hidden?: boolean;
  readonly hasFocus?: () => boolean;
  readonly fullscreenEnabled?: boolean;
  readonly fullscreenElement?: unknown;
  readonly documentElement?: { requestFullscreen?: () => Promise<void> };
  exitFullscreen?: () => Promise<void>;
  addEventListener?(type: "visibilitychange", listener: () => void): void;
}

export interface BrowserPlatformOptions {
  readonly window?: BrowserWindowLike;
  readonly storage?: SyncStringStorage;
}

function defaultWindow(): BrowserWindowLike | undefined {
  try { return typeof window === "undefined" ? undefined : window; } catch { return undefined; }
}

function storageFrom(windowLike: BrowserWindowLike | undefined): SyncStringStorage | undefined {
  try { return windowLike?.localStorage; } catch { return undefined; }
}

function fullscreenCapability(documentLike?: BrowserDocumentLike) {
  const element = documentLike?.documentElement;
  if (!documentLike?.fullscreenEnabled || !element?.requestFullscreen || !documentLike.exitFullscreen) {
    return unavailable<FullscreenService>("Fullscreen is not supported in this browser context.");
  }
  const service: FullscreenService = {
    get active() { return documentLike.fullscreenElement != null; },
    async enter() {
      try { await element.requestFullscreen?.(); return true; } catch { return false; }
    },
    async exit() {
      try { await documentLike.exitFullscreen?.(); return true; } catch { return false; }
    },
  };
  return available(service);
}

function overlayCapability(windowLike?: BrowserWindowLike) {
  if (!windowLike?.open) return unavailable<OverlayService>("External overlays are not supported in this context.");
  return available<OverlayService>({
    open(url) {
      let parsed: URL;
      try { parsed = new URL(url); } catch { return Promise.resolve(false); }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return Promise.resolve(false);
      try { return Promise.resolve(windowLike.open?.(parsed.href, "_blank", "noopener,noreferrer") != null); }
      catch { return Promise.resolve(false); }
    },
  });
}

/** Creates the offline-first browser composition without requiring any account or remote service. */
export function createBrowserPlatformServices(options: BrowserPlatformOptions = {}): PlatformServices {
  const windowLike = options.window ?? defaultWindow();
  const documentLike = windowLike?.document;
  const lifecycle = createLifecycleController({
    focused: documentLike?.hasFocus?.() ?? true,
    visible: !(documentLike?.hidden ?? false),
  });
  windowLike?.addEventListener?.("focus", () => { lifecycle.setFocused(true); });
  windowLike?.addEventListener?.("blur", () => { lifecycle.setFocused(false); });
  documentLike?.addEventListener?.("visibilitychange", () => { lifecycle.setVisible(!(documentLike.hidden ?? false)); });

  const storage = options.storage ?? storageFrom(windowLike);
  return Object.freeze({
    id: "browser",
    lifecycle,
    // Keys stay caller-owned during migration so legacy `tear_*` saves remain readable.
    settingsStorage: createSafeStorage(storage),
    profileStorage: createSafeStorage(storage),
    identity: unavailable("No account provider is configured."),
    cloudSave: unavailable("Cloud save is unavailable; progress is stored locally."),
    leaderboards: unavailable("Online leaderboards are unavailable."),
    ads: unavailable("Ads are not used in the standalone build."),
    achievements: unavailable("Platform achievements are unavailable."),
    analytics: unavailable("Analytics are not configured."),
    fullscreen: fullscreenCapability(documentLike),
    overlay: overlayCapability(windowLike),
  });
}
