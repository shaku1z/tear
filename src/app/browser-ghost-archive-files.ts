export interface GhostArchiveFile { readonly size: number; arrayBuffer(): Promise<ArrayBuffer> }
export interface GhostArchiveFilePort {
  readonly pick: (selected: (file: GhostArchiveFile) => void, cancelled: () => void) => () => void;
  readonly download: (bytes: Uint8Array, filename: string) => void;
}
interface BrowserArchiveFileOptions {
  readonly document: Document;
  readonly activation: () => boolean;
  readonly createUrl: (blob: Blob) => string;
  readonly revokeUrl: (url: string) => void;
  readonly defer: (callback: () => void) => void;
}
export class GhostArchiveFileError extends Error {
  constructor(readonly code: "activation-required" | "unavailable", message: string) { super(message); this.name = "GhostArchiveFileError"; }
}
export function createBrowserGhostArchiveFiles(options: BrowserArchiveFileOptions): GhostArchiveFilePort {
  return Object.freeze({
    pick(selected, cancelled) {
      if (!options.activation()) throw new GhostArchiveFileError("activation-required", "Click or tap SELECT ARCHIVE again to open the file picker.");
      const input = options.document.createElement("input"); input.type = "file"; input.accept = ".tearghost,.json,application/json"; input.hidden = true;
      input.setAttribute("aria-label", "Select a Ghost capsule archive");
      let finished = false;
      const cleanup = (): void => { input.removeEventListener("change", change); input.removeEventListener("cancel", cancel); input.value = ""; input.remove(); };
      const change = (): void => { if (finished) return; finished = true; const file = input.files?.[0]; cleanup(); if (file === undefined) cancelled(); else selected(file); };
      const cancel = (): void => { if (finished) return; finished = true; cleanup(); cancelled(); };
      input.addEventListener("change", change); input.addEventListener("cancel", cancel); options.document.body.append(input);
      try { input.click(); } catch (error) { cleanup(); throw error; }
      return () => { finished = true; cleanup(); };
    },
    download(bytes, filename) {
      const blob = new Blob([Uint8Array.from(bytes).buffer], { type: "application/json" }), url = options.createUrl(blob);
      const anchor = options.document.createElement("a"); anchor.href = url; anchor.download = filename.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 100) || "ghost.tearghost.json";
      try { options.document.body.append(anchor); anchor.click(); }
      finally { anchor.remove(); options.defer(() => { options.revokeUrl(url); }); }
    },
  } satisfies GhostArchiveFilePort);
}

export function normalBrowserGhostArchiveFiles(): GhostArchiveFilePort | undefined {
  if (typeof document === "undefined" || typeof navigator === "undefined" || typeof URL.createObjectURL !== "function") return undefined;
  return createBrowserGhostArchiveFiles({ document, activation: () => navigator.userActivation.isActive,
    createUrl: (blob) => URL.createObjectURL(blob), revokeUrl: (url) => { URL.revokeObjectURL(url); },
    defer: (callback) => { setTimeout(callback, 0); } });
}

/** BFCache clears transient selection without cancelling an authorized durable intent. */
export function bindGhostArchiveFileLifecycle(target: Pick<Window, "addEventListener" | "removeEventListener">,
  controller: Readonly<{ cancelArchive(): void; dispose(): void; refresh(): void }>): void {
  const hide = (event: PageTransitionEvent): void => {
    if (event.persisted) controller.cancelArchive();
    else { target.removeEventListener("pagehide", hide); target.removeEventListener("pageshow", show); controller.dispose(); }
  };
  const show = (event: PageTransitionEvent): void => { if (event.persisted) controller.refresh(); };
  target.addEventListener("pagehide", hide); target.addEventListener("pageshow", show);
}
