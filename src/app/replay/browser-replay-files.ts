/**
 * The browser's file picker and download, for replay files: IMPORT A REPLAY FILE and DOWNLOAD on the
 * REPLAYS list. Opening the picker needs the player's click (user activation).
 */
export interface ReplayFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface ReplayFilePort {
  readonly pick: (selected: (file: ReplayFile) => void, cancelled: () => void) => () => void;
  readonly download: (bytes: Uint8Array, filename: string) => void;
}
interface BrowserArchiveFileOptions {
  readonly document: Document;
  readonly activation: () => boolean;
  readonly createUrl: (blob: Blob) => string;
  readonly revokeUrl: (url: string) => void;
  readonly defer: (callback: () => void) => void;
}
export class ReplayFileError extends Error {
  constructor(
    readonly code: "activation-required" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ReplayFileError";
  }
}
export function createBrowserReplayFiles(options: BrowserArchiveFileOptions): ReplayFilePort {
  return Object.freeze({
    pick(selected, cancelled) {
      if (!options.activation())
        throw new ReplayFileError("activation-required", "Click IMPORT A REPLAY FILE again to choose a file.");
      const input = options.document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.hidden = true;
      input.setAttribute("aria-label", "Choose a replay file");
      let finished = false;
      const cleanup = (): void => {
        input.removeEventListener("change", change);
        input.removeEventListener("cancel", cancel);
        input.value = "";
        input.remove();
      };
      const change = (): void => {
        if (finished) return;
        finished = true;
        const file = input.files?.[0];
        cleanup();
        if (file === undefined) cancelled();
        else selected(file);
      };
      const cancel = (): void => {
        if (finished) return;
        finished = true;
        cleanup();
        cancelled();
      };
      input.addEventListener("change", change);
      input.addEventListener("cancel", cancel);
      options.document.body.append(input);
      try {
        input.click();
      } catch (error) {
        cleanup();
        throw error;
      }
      return () => {
        finished = true;
        cleanup();
      };
    },
    download(bytes, filename) {
      const blob = new Blob([Uint8Array.from(bytes).buffer], { type: "application/json" }),
        url = options.createUrl(blob);
      const anchor = options.document.createElement("a");
      anchor.href = url;
      anchor.download = filename.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 100) || "tear-replay.json";
      try {
        options.document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        options.defer(() => {
          options.revokeUrl(url);
        });
      }
    },
  } satisfies ReplayFilePort);
}

export function normalBrowserReplayFiles(): ReplayFilePort | undefined {
  if (typeof document === "undefined" || typeof navigator === "undefined" || typeof URL.createObjectURL !== "function")
    return undefined;
  return createBrowserReplayFiles({
    document,
    activation: () => navigator.userActivation.isActive,
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => {
      URL.revokeObjectURL(url);
    },
    defer: (callback) => {
      setTimeout(callback, 0);
    },
  });
}
