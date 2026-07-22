import type { SfxRoute } from "./mixer";

/** Every public synthesized effect cue has one stable semantic route. */
export const SYNTHESIZED_SFX_CUE_ROUTES = Object.freeze({
  swing: "weapons",
  hit: "weapons",
  launch: "weapons",
  updraft: "weapons",
  parry: "weapons",
  counter: "weapons",
  deflect: "weapons",
  throwBlade: "weapons",
  recall: "weapons",
  saberLock: "weapons",
  saberSizzle: "weapons",
  saberBreak: "weapons",
  crescent: "weapons",

  death: "player",
  hurt: "player",
  dash: "player",
  land: "player",
  jump: "player",
  rankup: "player",
  gameover: "player",

  sourceCross: "enemies",
  sourceRepel: "enemies",
  aldricFireWarn: "enemies",
  aldricIgnite: "enemies",
  wardenStaffScrape: "enemies",
  wardenStaffWhoosh: "enemies",
  wardenLockClang: "enemies",
  wardenGuardBreak: "enemies",
  aldricCleaverWhoosh: "enemies",
  aldricCleaverBury: "enemies",
  sweeperClang: "enemies",
  sweeperBat: "enemies",
  sweeperBounce: "enemies",
  wardenClash: "enemies",
  wardenLockdown: "enemies",
  wardenMortarLaunch: "enemies",
  wardenMortarWhistle: "enemies",
  colossusServo: "enemies",
  colossusPlate: "enemies",
  colossusStagger: "enemies",
  sawBounce: "enemies",
  sweeperCounter: "enemies",
  aldricCleaver: "enemies",
  sourceFracture: "enemies",
  dialogueTone: "enemies",
  sourceDepthPrepare: "enemies",
  sourceDepthSnap: "enemies",
  aldricCrownFall: "enemies",
  echoResonance: "enemies",
  bossDeathWarden: "enemies",
  bossDeathColossus: "enemies",
  bossDeathAldric: "enemies",
  bossDeathEcho: "enemies",
  bossDeathSource: "enemies",

  slam: "environment",
  boom: "environment",
  voidGroundTear: "environment",
  finalSilence: "environment",
  finalRelic: "environment",
  finalCut: "environment",
  finalRestore: "environment",
  voidTransfer: "environment",
  platformRebuild: "environment",
  wave: "environment",
} satisfies Readonly<Record<string, SfxRoute>>);

export type SynthesizedSfxCue = keyof typeof SYNTHESIZED_SFX_CUE_ROUTES;

export function synthesizedSfxRoute(property: PropertyKey): SfxRoute | undefined {
  if (typeof property !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(SYNTHESIZED_SFX_CUE_ROUTES, property)
    ? SYNTHESIZED_SFX_CUE_ROUTES[property as SynthesizedSfxCue]
    : undefined;
}
