import type { BossTell } from "../boss-tells";
import { ROOTBOUND_LAST_SPRING, type RootboundLastSpringStage } from "./rootbound-tuning";

type Box = Readonly<{ x: number; y: number; hw: number; hh: number }>;

/** The tell of the one move not yet on the shared move table: Last Spring. */
export interface RootboundTellActor {
  readonly lastSpringStage: RootboundLastSpringStage | null;
  readonly lastSpringT: number;
  lastSpringBand(): Box;
}

/** Last Spring's floor band, while it warns and strikes; null otherwise. */
export function rootboundLastSpringTell(boss: RootboundTellActor): BossTell | null {
  const stage = boss.lastSpringStage;
  if (stage !== "warning" && stage !== "bloom" && stage !== "commit") return null;
  const band = boss.lastSpringBand();
  const remaining = stage === "warning" ? boss.lastSpringT + ROOTBOUND_LAST_SPRING.bloom : boss.lastSpringT;
  return Object.freeze({
    id: "last-spring",
    attackId: "last-spring",
    mark: "band",
    stage: stage === "commit" ? "active" : "warning",
    x: band.x,
    y: band.y,
    hw: band.hw,
    hh: band.hh,
    leadSeconds: ROOTBOUND_LAST_SPRING.warning + ROOTBOUND_LAST_SPRING.bloom,
    remainingSeconds: stage === "commit" ? 0 : Math.max(0, remaining),
    damaging: true,
  });
}
