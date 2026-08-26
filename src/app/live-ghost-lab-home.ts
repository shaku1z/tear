import type { GhostLabScreenView } from "../presentation/screens/contracts";
import type { LivePlayerWatchController } from "./live-player-watch-controller";

/** Immutable normal-build C37 home projection; deliberately has no persistence or operational ports. */
export class LiveGhostLabHomeController {
  readonly #watch: LivePlayerWatchController;
  constructor(watch: LivePlayerWatchController) { this.#watch = watch; }
  snapshot(): GhostLabScreenView {
    const watch = this.#watch.snapshot();
    const watchAvailable = watch.status === "ready" || watch.status === "running" || watch.status === "paused";
    return Object.freeze({
      id: "ghostlab",
      subtitle: "local replay routes and clearly bounded availability",
      routes: Object.freeze([
        Object.freeze({ id: "training-archive", label: "TRAINING ARCHIVE", detail: "Inspect local training custody and consent decisions." }),
        Object.freeze({ id: "training-operations", label: "TRAINING OPERATIONS", detail: "Read local recovery and schedule projections." }),
        Object.freeze({ id: "vault", label: "REPLAY VAULT", detail: "Open local capsules; Theater and Coach stay capsule-gated." }),
      ]),
      unavailable: Object.freeze([
        ...(watchAvailable ? [] : [Object.freeze({
          label: "RUN MONITOR",
          detail: watch.status === "checking"
            ? "Checking the local canonical policy; Run Monitor controls remain disabled."
            : watch.status === "stopped"
              ? "Run Monitor is stopped; native play is restored and no monitor command is available here."
              : "Unavailable until a valid canonical V3 policy is installed locally."
        })]),
        Object.freeze({ label: "SCENARIO CONSOLE", detail: "Scenario controls remain test and engineering evidence only." }),
        Object.freeze({ label: "GAME AGENT EVIDENCE", detail: "Unavailable until one exact retained Game Agent evaluation report is bound and verified locally." }),
        Object.freeze({ label: "GAME AGENT LADDER", detail: "No certified player ladder or placement is available; local evidence stays unassigned." }),
        Object.freeze({ label: "REPLAY EDITOR", detail: "The existing Replay Editor sub-editor remains inside replay playback; no standalone player route is available." }),
      ]),
      watch,
    });
  }
}

export function createLiveGhostLabHome(watch: LivePlayerWatchController): Readonly<{ snapshot: () => GhostLabScreenView }> {
  const controller = new LiveGhostLabHomeController(watch);
  return Object.freeze({ snapshot: () => controller.snapshot() });
}
