import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import { SourceVoidController } from "../gameplay/training/arena-rules";

/** Builds the Source's void traversal controller from canonical tuning. */
export function createLiveSourceVoidController(
  dependencies: GameRuntimeDependencies,
  width: number,
  height: number,
): SourceVoidController {
  const { CONFIG } = dependencies;
  return new SourceVoidController({
    voidSpawnBehind: CONFIG.source.voidSpawnBehind,
    voidSpawnAhead: CONFIG.source.voidSpawnAhead,
    voidChunkWidthMin: CONFIG.source.voidChunkWidthMin,
    voidChunkWidthMax: CONFIG.source.voidChunkWidthMax,
    voidPlatformWidthMin: CONFIG.source.voidPlatformWidthMin,
    voidPlatformWidthMax: CONFIG.source.voidPlatformWidthMax,
    voidLowerMin: CONFIG.source.voidLowerMin,
    voidLowerMax: CONFIG.source.voidLowerMax,
    voidUpperMin: CONFIG.source.voidUpperMin,
    voidUpperMax: CONFIG.source.voidUpperMax,
    voidLaneClearance: CONFIG.source.voidLaneClearance,
    voidTransferMin: CONFIG.source.voidTransferMin,
    voidTransferMax: CONFIG.source.voidTransferMax,
    scrollSpeed: CONFIG.source.scrollSpeed,
    scrollSpeedMax: CONFIG.source.scrollSpeedMax,
    thawSpeedMult: CONFIG.source.thawSpeedMult || 1.35,
    voidFirePeriod: CONFIG.source.voidFirePeriod,
    voidFireArm: CONFIG.source.voidFireArm,
    voidFireHot: CONFIG.source.voidFireHot,
    voidCageH: CONFIG.source.voidCageH,
    voidCageHalfW: CONFIG.source.voidCageHalfW,
    descentArrival: CONFIG.source.descentArrival,
    descentIngressBelow: CONFIG.source.descentIngressBelow,
    voidTransferGrace: CONFIG.source.voidTransferGrace,
    voidCamZoom: CONFIG.source.voidCamZoom,
    voidRecycleMargin: CONFIG.source.voidRecycleMargin,
    scrollRamp: CONFIG.source.scrollRamp || 4,
    voidWispCooldown: CONFIG.source.voidWispCd,
    arrivalFxStep: CONFIG.effects.voidArrivalFxStep || 0.07,
    crackWarn: CONFIG.source.crackWarn,
    descentDissolve: CONFIG.source.descentDissolve,
    descentLift: CONFIG.source.descentLift,
    descentReveal: CONFIG.source.descentReveal,
    voidCrumbleStand: CONFIG.source.voidCrumbleStand,
    voidFallDamage: CONFIG.source.voidFallDmg,
    voidSlowDuration: CONFIG.source.voidSlowDur,
  }, { width, height, groundY: CONFIG.world.groundY }, {
    jumpSpeed: CONFIG.player.jumpSpeed, gravity: CONFIG.world.gravity,
    moveSpeed: CONFIG.player.moveSpeed, dashSpeed: CONFIG.dash.speed, dashDuration: CONFIG.dash.duration,
  }, {
    dialogueDuck: CONFIG.presentation.dialogueDuck, unmakeMix: CONFIG.presentation.voidUnmakeMix,
    releaseMix: CONFIG.presentation.voidReleaseMix, revealMix: CONFIG.presentation.voidRevealMix,
  });
}
