import type { GhostLabScreenView } from "../presentation/screens/contracts";
import type { LivePlayerWatchController } from "./live-player-watch-controller";

/** Immutable normal-build C37 home projection; deliberately has no persistence or operational ports. */
export class LiveGhostLabHomeController {
  readonly #watch: LivePlayerWatchController;
  constructor(watch: LivePlayerWatchController) { this.#watch = watch; }
  snapshot(): GhostLabScreenView {
    return Object.freeze({
      id: "ghostlab",
      subtitle: "local routes and clearly bounded availability",
      routes: Object.freeze([
        Object.freeze({ id: "academy", label: "ACADEMY", detail: "Inspect local training custody and consent decisions." }),
        Object.freeze({ id: "foundry", label: "FOUNDRY STATUS", detail: "Read local recovery and schedule projections." }),
        Object.freeze({ id: "vault", label: "GHOST VAULT", detail: "Open local capsules; Theater and Coach stay capsule-gated." }),
        Object.freeze({ id: "watch", label: "WATCH", detail: this.#watch.snapshot().detail }),
      ]),
      unavailable: Object.freeze([
        Object.freeze({ label: "WATCH", detail: "Unavailable until a valid canonical V3 candidate is installed locally." }),
        Object.freeze({ label: "STATE FORGE", detail: "Studio controls remain test and engineering evidence only." }),
        Object.freeze({ label: "BOT LADDER", detail: "No certified player ladder or placement is available." }),
        Object.freeze({ label: "STUDIO", detail: "No normal-build forensic or branch-control surface is available." }),
      ]),
      watch: this.#watch.snapshot(),
    });
  }
}

export function createLiveGhostLabHome(watch: LivePlayerWatchController): Readonly<{ snapshot: () => GhostLabScreenView }> {
  const controller = new LiveGhostLabHomeController(watch);
  return Object.freeze({ snapshot: () => controller.snapshot() });
}
