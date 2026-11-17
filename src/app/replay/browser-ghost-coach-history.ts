import { browserOnline } from "../../platform/worker-cache-warmup";
import { listBrowserGhostCapsuleManifests } from "../../ghost/browser-capsule-vault";
import { ghostCoachCandidate, type GhostCoachHistory } from "../../ghost/coach-history";
import type { GhostCoachHistoryPort } from "../library/ghost-coach-history-controller";

export function createCoachHistoryWorker(): Worker {
  return new Worker(new URL("../../ghost/coach-history-worker.ts", import.meta.url), { type: "module" });
}

export function createBrowserGhostCoachHistoryPort(factory: IDBFactory | undefined): GhostCoachHistoryPort {
  const list = async () => (await listBrowserGhostCapsuleManifests(factory)).map(ghostCoachCandidate);
  const port: GhostCoachHistoryPort = {
    list,
    async current(sources) {
      const current = await list();
      return sources.every((source) =>
        current.some((candidate) => candidate.id === source.id && candidate.identity === source.identity),
      );
    },
    analyze(sources) {
      if (factory === undefined) throw new Error("Local recordings are unavailable in this browser.");
      const worker = createCoachHistoryWorker();
      let rejectPending: (reason: Error) => void = () => undefined;
      const result = new Promise<GhostCoachHistory>((resolve, reject) => {
        rejectPending = reject;
        worker.addEventListener("error", () => {
          reject(
            new Error(
              browserOnline()
                ? "History worker unavailable."
                : "History analysis needs one online visit first; your recordings are still listed.",
            ),
          );
        });
        worker.addEventListener("message", (event: MessageEvent<{ result?: GhostCoachHistory; error?: string }>) => {
          if (event.data.result !== undefined) resolve(event.data.result);
          else reject(new Error(event.data.error ?? "History unavailable."));
        });
        worker.postMessage({ sources });
      });
      return Object.freeze({
        result,
        cancel() {
          worker.terminate();
          rejectPending(new Error("History selection cancelled."));
        },
      });
    },
  };
  return Object.freeze(port);
}
