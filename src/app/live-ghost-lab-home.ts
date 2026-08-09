import type { GhostLabScreenView } from "../presentation/screens/contracts";

/** Immutable normal-build C37 home projection; deliberately has no persistence or operational ports. */
export class LiveGhostLabHomeController {
  snapshot(): GhostLabScreenView {
    return Object.freeze({
      id: "ghostlab",
      subtitle: "local routes and clearly bounded availability",
      routes: Object.freeze([
        Object.freeze({ id: "academy", label: "ACADEMY", detail: "Inspect local training custody and consent decisions." }),
        Object.freeze({ id: "foundry", label: "FOUNDRY STATUS", detail: "Read local recovery and schedule projections." }),
        Object.freeze({ id: "vault", label: "GHOST VAULT", detail: "Open local capsules; Theater and Coach stay capsule-gated." }),
      ]),
      unavailable: Object.freeze([
        Object.freeze({ label: "WATCH", detail: "No player-facing monitoring or traffic route is available." }),
        Object.freeze({ label: "STATE FORGE", detail: "Studio controls remain test and engineering evidence only." }),
        Object.freeze({ label: "BOT LADDER", detail: "No certified player ladder or placement is available." }),
        Object.freeze({ label: "STUDIO", detail: "No normal-build forensic or branch-control surface is available." }),
      ]),
    });
  }
}

export function createLiveGhostLabHome(): Readonly<{ snapshot: () => GhostLabScreenView }> {
  const controller = new LiveGhostLabHomeController();
  return Object.freeze({ snapshot: () => controller.snapshot() });
}
