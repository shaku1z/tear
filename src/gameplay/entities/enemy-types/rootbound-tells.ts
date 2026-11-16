import type { BossTell, BossTellMark, BossTellStage } from "../boss-tells";
import {
  ROOTBOUND_CANOPY_STEP,
  ROOTBOUND_LAST_SPRING,
  ROOTBOUND_MEMORY_CHOIR,
  ROOTBOUND_ROOTLINE,
  ROOTBOUND_SEED_ARC,
  ROOTBOUND_VINE_SWEEP,
  type RootboundCanopyStepStage,
  type RootboundLastSpringStage,
  type RootboundMemoryChoirManifestation,
  type RootboundMemoryChoirStage,
  type RootboundRootlineStage,
  type RootboundSeedArcStage,
  type RootboundVineSweepStage,
} from "./rootbound-tuning";

type Box = Readonly<{ x: number; y: number; hw: number; hh: number }>;

export interface RootboundTellActor extends Box {
  readonly vineSweepStage: RootboundVineSweepStage | null;
  readonly vineSweepT: number;
  readonly seedArcStage: RootboundSeedArcStage | null;
  readonly seedArcT: number;
  readonly rootlineStage: RootboundRootlineStage | null;
  readonly rootlineT: number;
  readonly rootlineFacing: number;
  readonly canopyStepStage: RootboundCanopyStepStage | null;
  readonly canopyStepT: number;
  readonly canopyDestination: Readonly<{ x: number; y: number }> | null;
  readonly memoryChoirStage: RootboundMemoryChoirStage | null;
  readonly memoryChoirT: number;
  readonly memoryChoirElapsed: number;
  readonly memoryChoirManifestations: readonly RootboundMemoryChoirManifestation[];
  readonly lastSpringStage: RootboundLastSpringStage | null;
  readonly lastSpringT: number;
  vineSweepGeometry(): Box & Readonly<{ facing: number }>;
  rootlineGeometry(): Readonly<{ x: number; y: number; w: number; h: number }>;
  lastSpringBand(): Box;
}

function tell(
  id: string,
  mark: BossTellMark,
  stage: BossTellStage,
  box: Box,
  leadSeconds: number,
  remainingSeconds: number,
  extra: Readonly<{ dir?: number; damaging?: boolean }> = {},
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
    ...(extra.dir === undefined ? {} : { dir: extra.dir }),
    leadSeconds,
    remainingSeconds: stage === "active" ? 0 : Math.max(0, remainingSeconds),
    damaging: extra.damaging ?? true,
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

/** The Rootbound's current tells, read from the same stage fields its attacks advance. */
export function rootboundTells(boss: RootboundTellActor): readonly BossTell[] {
  const out: BossTell[] = [];
  if (boss.vineSweepStage === "windup" || boss.vineSweepStage === "active") {
    const g = boss.vineSweepGeometry();
    const stage = boss.vineSweepStage === "active" ? "active" : "warning";
    out.push(tell("vine-sweep", "lane", stage, g, ROOTBOUND_VINE_SWEEP.windup, boss.vineSweepT, { dir: g.facing }));
  }
  // The seeds choose their landing spots at release, so the windup can only mark the thrower.
  if (boss.seedArcStage === "windup")
    out.push(tell("seed-arc", "self", "warning", boss, ROOTBOUND_SEED_ARC.windup, boss.seedArcT));
  if (boss.rootlineStage === "warning" || boss.rootlineStage === "active") {
    const g = boss.rootlineGeometry();
    const box = { x: g.x + g.w / 2, y: g.y + g.h / 2, hw: g.w / 2, hh: g.h / 2 };
    const stage = boss.rootlineStage === "active" ? "active" : "warning";
    out.push(
      tell("rootline", "lane", stage, box, ROOTBOUND_ROOTLINE.windup, boss.rootlineT, { dir: boss.rootlineFacing }),
    );
  }
  if (boss.canopyStepStage === "telegraph" && boss.canopyDestination !== null) {
    const box = { x: boss.canopyDestination.x, y: boss.canopyDestination.y, hw: boss.hw, hh: boss.hh };
    out.push(
      tell("canopy-step", "destination", "warning", box, ROOTBOUND_CANOPY_STEP.telegraph, boss.canopyStepT, {
        damaging: false,
      }),
    );
  }
  choirTells(boss, out);
  lastSpringTell(boss, out);
  return Object.freeze(out);
}
