import type {
  BossIntroSnapshot,
  ReticleSnapshot,
  StageBannerSnapshot,
  TouchControlsSnapshot,
  TutorialCardSnapshot,
  WaveBannerSnapshot,
  WorldRect,
} from "./contracts";

export interface TutorialCardSource {
  readonly context: string;
  readonly title: string;
  readonly goal: string;
  readonly final: boolean;
  readonly bossPractice?: boolean;
}
export function buildTutorialCardSnapshot(
  exercise: TutorialCardSource,
  keys: readonly string[],
  progress: readonly [number, number] | undefined,
  doneTime: number,
  clearTop?: number,
): TutorialCardSnapshot {
  return Object.freeze({
    context: exercise.context,
    ...(exercise.bossPractice === true ? { bossPractice: true } : {}),
    title: exercise.title,
    description: exercise.goal,
    keys,
    final: exercise.final,
    completedBeat: doneTime,
    progress: progress === undefined || exercise.final ? undefined : { current: progress[0], goal: progress[1] },
    clearTop,
  });
}

export interface TouchCircleSource {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}
export interface TouchButtonSource extends TouchCircleSource {
  readonly label: string;
}
/** The input layer's single touch layout (src/input/touch-control-layout.ts), passed through unchanged. */
export interface TouchLayoutSource {
  readonly jump: TouchButtonSource;
  readonly dash: TouchButtonSource;
  readonly throwB: TouchButtonSource;
  readonly pause: TouchButtonSource;
  readonly joystickHome: TouchCircleSource;
  readonly aimPad: TouchCircleSource;
}
export interface TouchJoystickSource {
  readonly active?: boolean;
  readonly ax: number;
  readonly ay: number;
  readonly dx: number;
  readonly dy: number;
}
export function buildTouchControlsSnapshot(input: {
  readonly layout: TouchLayoutSource;
  readonly joystick: TouchJoystickSource;
  readonly held: Readonly<Record<string, boolean>>;
  readonly aim?: Readonly<{ x: number; y: number }>;
  readonly onboardingAlpha: number;
}): TouchControlsSnapshot {
  const button = (source: TouchButtonSource, key: string, prominent: boolean) => ({
    x: source.x,
    y: source.y,
    radius: source.r,
    label: source.label,
    held: input.held[key] === true,
    prominent,
  });
  const home = input.layout.joystickHome;
  return Object.freeze({
    joystick: {
      active: input.joystick.active === true,
      anchorX: input.joystick.active ? input.joystick.ax : home.x,
      anchorY: input.joystick.active ? input.joystick.ay : home.y,
      dx: input.joystick.dx,
      dy: input.joystick.dy,
      radius: home.r,
      homeX: home.x,
      homeY: home.y,
    },
    aim: input.aim,
    aimPad: { x: input.layout.aimPad.x, y: input.layout.aimPad.y, r: input.layout.aimPad.r },
    buttons: [
      button(input.layout.jump, "jump", true),
      button(input.layout.dash, "dash", false),
      button(input.layout.throwB, "throwB", false),
      button(input.layout.pause, "pause", false),
    ],
    onboardingAlpha: input.onboardingAlpha,
  });
}

export function buildWaveBannerSnapshot(
  input: Omit<WaveBannerSnapshot, "remainingFraction"> & {
    readonly remainingSeconds: number;
    readonly duration: number;
  },
): WaveBannerSnapshot {
  return Object.freeze({
    remainingFraction: input.remainingSeconds / input.duration,
    bossWave: input.bossWave,
    wave: input.wave,
    waveTag: input.waveTag,
    horde: input.horde,
    hordeColor: input.hordeColor,
    normalColor: input.normalColor,
  });
}
export function buildBossIntroSnapshot(
  screen: WorldRect,
  boss: Readonly<{ bossName?: string; epithet?: string; openingLine?: string; color?: string }>,
  elapsed: number,
  duration: number,
  fallbackColor: string,
): BossIntroSnapshot {
  return Object.freeze({
    screen,
    bossName: boss.bossName ?? "BOSS",
    epithet: boss.epithet ?? "",
    openingLine: boss.openingLine ?? "",
    color: boss.color ?? fallbackColor,
    elapsed,
    duration,
  });
}
export function buildStageBannerSnapshot(input: StageBannerSnapshot): StageBannerSnapshot {
  return Object.freeze({ ...input });
}

export interface ReticleBladeSource {
  readonly reticleX: number;
  readonly reticleY: number;
  readonly state: string;
  readonly tipVY: number;
}
export function buildReticleSnapshot(input: {
  readonly blade: ReticleBladeSource;
  readonly airborne: boolean;
  readonly playerVerticalSpeed: number;
  readonly slamMinDownSpeed: number;
  readonly slamPowerSpeed: number;
  readonly slamEmpowerAt: number;
  readonly launchMinUpSpeed: number;
  readonly risingSpeedReference: number;
  readonly slamColor: string;
  readonly updraftColor: string;
}): ReticleSnapshot {
  let power: ReticleSnapshot["power"];
  if (input.airborne && input.blade.state === "held") {
    if (
      input.blade.tipVY > input.slamMinDownSpeed * 0.7 &&
      input.playerVerticalSpeed > input.slamPowerSpeed * input.slamEmpowerAt
    )
      power = "slam";
    else if (
      input.blade.tipVY < -input.launchMinUpSpeed * 0.7 &&
      -input.playerVerticalSpeed > input.risingSpeedReference * 0.45
    )
      power = "updraft";
  }
  return Object.freeze({
    x: input.blade.reticleX,
    y: input.blade.reticleY,
    power,
    slamColor: input.slamColor,
    updraftColor: input.updraftColor,
  });
}
