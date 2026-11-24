import { stableVerificationHash } from "../../domain/hash";
import { REPLAY_TICKS_PER_SECOND } from "../../replay/record";
import type { ReplayScreenView } from "../../presentation/screens/contracts";
import type { ReplayClip, ReplayClipExportPort, ReplayClipSource, ReplayClipWebm } from "./browser-replay-clip-export";

type ExportStatus = "idle" | "rendering" | "ready" | "failed" | "cancelled" | "download-requested";

/** The replay editor (engineering builds only): ranges of the watched run, encoded to a local WebM file. */
export interface ReplayClipEditor {
  readonly isOpen: () => boolean;
  readonly toggle: () => void;
  readonly markIn: (tick: number) => void;
  /** Adds the range from the IN mark (or five seconds back) to `tick`, at the replay's speed now. */
  readonly append: (tick: number, speed: number) => void;
  readonly clear: () => void;
  readonly encode: () => void;
  readonly cancel: () => void;
  readonly download: () => void;
  readonly view: () => Pick<ReplayScreenView, "cutList" | "clipExport">;
  readonly dispose: () => void;
}

export interface ReplayClipEditorOptions {
  readonly id: string;
  readonly port: ReplayClipExportPort;
  /** A watch of the same run, for the export to draw from without moving the replay on screen. */
  readonly source: () => ReplayClipSource;
  /** Says something on the replay bar. */
  readonly say: (message: string) => void;
}

export function createReplayClipEditor(options: ReplayClipEditorOptions): ReplayClipEditor {
  const { port, say } = options;
  let open = false;
  let mark: number | undefined;
  let clips: readonly ReplayClip[] = [];
  let operation: AbortController | undefined;
  let exported: ReplayClipWebm | undefined;
  let status: ExportStatus = "idle";
  /** Drops an encoding in progress and the last encoded file: the clips they were made from changed. */
  const invalidate = (): void => {
    operation?.abort();
    operation = undefined;
    exported = undefined;
    status = "idle";
    port.dispose();
  };
  return Object.freeze<ReplayClipEditor>({
    isOpen: () => open,
    toggle: () => {
      open = !open;
    },
    markIn: (tick) => {
      invalidate();
      mark = tick;
      say(`IN marked at TICK ${String(tick)}. Seek the OUT point and append.`);
    },
    append: (tick, speed) => {
      const from = mark ?? Math.max(0, tick - 5 * REPLAY_TICKS_PER_SECOND);
      if (from >= tick) {
        say("Mark an earlier IN point, then seek a later OUT point.");
        return;
      }
      invalidate();
      clips = Object.freeze([...clips, Object.freeze({ fromTick: from, toTick: tick, speed })]);
      mark = undefined;
      say("Range appended in order · simulation time.");
    },
    clear: () => {
      invalidate();
      clips = [];
      mark = undefined;
    },
    encode: () => {
      if (clips.length === 0 || !port.available()) return;
      invalidate();
      const current = new AbortController();
      operation = current;
      status = "rendering";
      say("Encoding the replay on its own canvas; the game canvas is not recorded.");
      const source = options.source();
      const settle = (next: ExportStatus, message: string, file?: ReplayClipWebm): void => {
        source.dispose();
        if (operation !== current || current.signal.aborted) return;
        status = next;
        exported = file;
        say(message);
      };
      void port.render(source, clips, current.signal).then(
        (file) => {
          settle("ready", "WebM encoded locally. Click DOWNLOAD WEBM to save it.", file);
        },
        (error: unknown) => {
          settle("failed", `Clip export refused: ${error instanceof Error ? error.message : String(error)}`);
        },
      );
    },
    cancel: () => {
      invalidate();
      status = "cancelled";
      say("Clip export cancelled.");
    },
    download: () => {
      const file = exported,
        current = operation;
      if (file === undefined || current === undefined) return;
      void port.download(file, current.signal).then(
        () => {
          if (operation === current && !current.signal.aborted) {
            status = "download-requested";
            say("WebM download requested; the browser's save is not confirmed.");
          }
        },
        (error: unknown) => {
          if (operation === current && !current.signal.aborted) say(`Download refused: ${String(error)}`);
        },
      );
    },
    view: () =>
      open
        ? Object.freeze({
            cutList: Object.freeze({
              available: true,
              sourceGhostId: options.id,
              clipCount: clips.length,
              ...(clips.length === 0
                ? {}
                : {
                    fromTick: clips[0]?.fromTick ?? 0,
                    toTick: clips.at(-1)?.toTick ?? 0,
                    cutListHash: stableVerificationHash(clips),
                  }),
            }),
            clipExport: Object.freeze({
              available: port.available(),
              status,
              markIn: mark,
              thumbnail: exported?.thumbnail,
              duration: exported?.durationSeconds,
            }),
          })
        : {},
    dispose: () => {
      invalidate();
      open = false;
      clips = [];
      mark = undefined;
    },
  });
}
