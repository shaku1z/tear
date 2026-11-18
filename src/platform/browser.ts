import {
  available,
  unavailable,
  type Capability,
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

interface FullscreenTargetLike {
  requestFullscreen?: () => Promise<void>;
}

/**
 * The element that goes fullscreen: the page's game wrapper, which holds the canvas and the
 * HTML controls over it, so the stylesheet's `#wrap:fullscreen` rules apply.
 */
const FULLSCREEN_TARGET_ID = "wrap";

export interface BrowserDocumentLike {
  readonly hidden?: boolean;
  readonly hasFocus?: () => boolean;
  readonly fullscreenEnabled?: boolean;
  readonly fullscreenElement?: unknown;
  readonly documentElement?: FullscreenTargetLike;
  getElementById?(id: string): FullscreenTargetLike | null;
  exitFullscreen?: () => Promise<void>;
  addEventListener?(type: "visibilitychange", listener: () => void): void;
}

export interface BrowserPlatformOptions {
  readonly window?: BrowserWindowLike;
  readonly storage?: SyncStringStorage;
}

function defaultWindow(): BrowserWindowLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window;
  } catch {
    return undefined;
  }
}

function storageFrom(windowLike: BrowserWindowLike | undefined): SyncStringStorage | undefined {
  try {
    return windowLike?.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The one owner of page fullscreen; the fullscreen button and key both call it. Element
 * fullscreen is optional: iPhone Safari has none (`fullscreenEnabled` is undefined), and a
 * browser may refuse a request, so both report "not available" or `false` instead of throwing.
 */
export function browserFullscreen(documentLike?: BrowserDocumentLike): Capability<FullscreenService> {
  const root = documentLike?.documentElement;
  if (!documentLike?.fullscreenEnabled || !root?.requestFullscreen || !documentLike.exitFullscreen) {
    return unavailable<FullscreenService>("Fullscreen is not supported in this browser context.");
  }
  const service: FullscreenService = {
    get active() {
      return documentLike.fullscreenElement != null;
    },
    async enter() {
      try {
        // Looked up per request: the wrapper may be added after the services are created.
        const target = documentLike.getElementById?.(FULLSCREEN_TARGET_ID) ?? root;
        await target.requestFullscreen?.();
        return true;
      } catch {
        return false;
      }
    },
    async exit() {
      try {
        await documentLike.exitFullscreen?.();
        return true;
      } catch {
        return false;
      }
    },
  };
  return available(service);
}

function overlayCapability(windowLike?: BrowserWindowLike) {
  if (!windowLike?.open) return unavailable<OverlayService>("External overlays are not supported in this context.");
  return available<OverlayService>({
    open(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return Promise.resolve(false);
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return Promise.resolve(false);
      try {
        return Promise.resolve(windowLike.open?.(parsed.href, "_blank", "noopener,noreferrer") != null);
      } catch {
        return Promise.resolve(false);
      }
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
  windowLike?.addEventListener?.("focus", () => {
    lifecycle.setFocused(true);
  });
  windowLike?.addEventListener?.("blur", () => {
    lifecycle.setFocused(false);
  });
  documentLike?.addEventListener?.("visibilitychange", () => {
    lifecycle.setVisible(!(documentLike.hidden ?? false));
  });

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
    fullscreen: browserFullscreen(documentLike),
    overlay: overlayCapability(windowLike),
  });
}
