import type { BossTell, BossTellMark, BossTellStage } from "../boss-tells";
import {
  ROOTBOUND_LAST_SPRING,
  ROOTBOUND_MEMORY_CHOIR,
  type RootboundLastSpringStage,
  type RootboundMemoryChoirManifestation,
  type RootboundMemoryChoirStage,
} from "./rootbound-tuning";

type Box = Readonly<{ x: number; y: number; hw: number; hh: number }>;

/** The tells of the moves not yet on the shared move table: the Memory Choir and Last Spring. */
export interface RootboundTellActor extends Box {
  readonly memoryChoirStage: RootboundMemoryChoirStage | null;
  readonly memoryChoirT: number;
  readonly memoryChoirElapsed: number;
  readonly memoryChoirManifestations: readonly RootboundMemoryChoirManifestation[];
  readonly lastSpringStage: RootboundLastSpringStage | null;
  readonly lastSpringT: number;
  lastSpringBand(): Box;
}

function tell(
  id: string,
  mark: BossTellMark,
  stage: BossTellStage,
  box: Box,
  leadSeconds: number,
  remainingSeconds: number,
): BossTell {
  return Object.freeze({
    id,
    attackId: id.split(":")[0] ?? id,
    mark,
    stage,
    x: box.x,
    y: box.y,
    hw: box.hw,
    hh: box.hh,
    leadSeconds,
    remainingSeconds: stage === "active" ? 0 : Math.max(0, remainingSeconds),
    damaging: true,
  });
}

function choirTells(boss: RootboundTellActor, out: BossTell[]): void {
  if (boss.memoryChoirStage !== "warning" && boss.memoryChoirStage !== "active") return;
  for (const echo of boss.memoryChoirManifestations) {
    const box = { x: echo.x + echo.w / 2, y: echo.y + echo.h / 2, hw: echo.w / 2, hh: echo.h / 2 };
    const lead = ROOTBOUND_MEMORY_CHOIR.warning + echo.activationDelay;
    if (boss.memoryChoirStage === "warning")
      out.push(tell(echo.id, "box", "warning", box, lead, boss.memoryChoirT + echo.activationDelay));
    else if (boss.memoryChoirElapsed < echo.activationDelay)
      out.push(tell(echo.id, "box", "warning", box, lead, echo.activationDelay - boss.memoryChoirElapsed));
    else if (boss.memoryChoirElapsed < echo.activationDelay + ROOTBOUND_MEMORY_CHOIR.active)
      out.push(tell(echo.id, "box", "active", box, lead, 0));
  }
}

function lastSpringTell(boss: RootboundTellActor, out: BossTell[]): void {
  const stage = boss.lastSpringStage;
  if (stage !== "warning" && stage !== "bloom" && stage !== "commit") return;
  const lead = ROOTBOUND_LAST_SPRING.warning + ROOTBOUND_LAST_SPRING.bloom;
  const remaining = stage === "warning" ? boss.lastSpringT + ROOTBOUND_LAST_SPRING.bloom : boss.lastSpringT;
  out.push(
    tell("last-spring", "band", stage === "commit" ? "active" : "warning", boss.lastSpringBand(), lead, remaining),
  );
}

/** The Memory Choir and Last Spring tells; the move table reports its own through the shared runner. */
export function rootboundTells(boss: RootboundTellActor): readonly BossTell[] {
  const out: BossTell[] = [];
  choirTells(boss, out);
  lastSpringTell(boss, out);
  return Object.freeze(out);
}
