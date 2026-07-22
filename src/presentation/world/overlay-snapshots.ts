import type {
  BossIntroSnapshot,
  PlaygroundHelpSnapshot,
  ReticleSnapshot,
  StageBannerSnapshot,
  TouchControlsSnapshot,
  TutorialCardSnapshot,
  WaveBannerSnapshot,
  WorldRect,
} from "./contracts";

export interface TutorialLessonSource {
  readonly t: string; readonly d: string; readonly keys?: readonly string[]; readonly final?: boolean;
  readonly prog?: () => readonly [number, number];
}
export function buildTutorialCardSnapshot(index: number, count: number, lesson: TutorialLessonSource, doneTime: number): TutorialCardSnapshot {
  const progress = lesson.prog !== undefined && lesson.final !== true ? lesson.prog() : undefined;
  return Object.freeze({ lessonIndex: index, lessonCount: count, title: lesson.t, description: lesson.d,
    keys: lesson.keys ?? [], final: lesson.final === true, completedBeat: doneTime,
    progress: progress === undefined ? undefined : { current: progress[0], goal: progress[1] } });
}

export interface WeaponStatsSource {
  readonly heldHits: number; readonly throws: number; readonly throwHits: number;
  readonly perfectParries: number; readonly breakTriggers: number;
}
export function buildPlaygroundHelpSnapshot(weaponId: string, stats: WeaponStatsSource): PlaygroundHelpSnapshot {
  return Object.freeze({ weaponId, heldHits: stats.heldHits, throws: stats.throws, throwHits: stats.throwHits,
    perfectParries: stats.perfectParries, breakTriggers: stats.breakTriggers });
}

export interface TouchButtonSource { readonly x: number; readonly y: number; readonly r: number; readonly label: string }
export interface TouchLayoutSource {
  readonly jump: TouchButtonSource; readonly dash: TouchButtonSource;
  readonly throwB: TouchButtonSource; readonly pause: TouchButtonSource;
}
export interface TouchJoystickSource { readonly active?: boolean; readonly ax: number; readonly ay: number; readonly dx: number; readonly dy: number }
export function buildTouchControlsSnapshot(input: {
  readonly layout: TouchLayoutSource; readonly joystick: TouchJoystickSource; readonly held: Readonly<Record<string, boolean>>;
  readonly aim?: Readonly<{ x: number; y: number }>; readonly onboardingAlpha: number;
  readonly safeLeft: number; readonly safeBottom: number; readonly height: number;
}): TouchControlsSnapshot {
  const button = (source: TouchButtonSource, key: string, prominent: boolean) => ({
    x: source.x, y: source.y, radius: source.r, label: source.label, held: input.held[key] === true, prominent,
  });
  return Object.freeze({ joystick: { active: input.joystick.active === true,
    anchorX: input.joystick.active ? input.joystick.ax : 200 + input.safeLeft,
    anchorY: input.joystick.active ? input.joystick.ay : input.height - 190 - input.safeBottom,
    dx: input.joystick.dx, dy: input.joystick.dy }, aim: input.aim,
    buttons: [button(input.layout.jump, "jump", true), button(input.layout.dash, "dash", false),
      button(input.layout.throwB, "throwB", false), button(input.layout.pause, "pause", false)],
    onboardingAlpha: input.onboardingAlpha });
}

export function buildWaveBannerSnapshot(input: Omit<WaveBannerSnapshot, "remainingFraction"> & {
  readonly remainingSeconds: number; readonly duration: number;
}): WaveBannerSnapshot {
  return Object.freeze({ remainingFraction: input.remainingSeconds / input.duration, bossWave: input.bossWave,
    wave: input.wave, waveTag: input.waveTag, horde: input.horde, hordeColor: input.hordeColor, normalColor: input.normalColor });
}
export function buildBossIntroSnapshot(screen: WorldRect, boss: Readonly<{ bossName?: string; epithet?: string; color?: string }>,
  elapsed: number, duration: number, fallbackColor: string): BossIntroSnapshot {
  return Object.freeze({ screen, bossName: boss.bossName ?? "BOSS", epithet: boss.epithet ?? "",
    color: boss.color ?? fallbackColor, elapsed, duration });
}
export function buildStageBannerSnapshot(input: StageBannerSnapshot): StageBannerSnapshot { return Object.freeze({ ...input }); }

export interface ReticleBladeSource {
  readonly reticleX: number; readonly reticleY: number; readonly state: string; readonly tipVY: number;
}
export function buildReticleSnapshot(input: {
  readonly blade: ReticleBladeSource; readonly airborne: boolean; readonly playerVerticalSpeed: number;
  readonly slamMinDownSpeed: number; readonly slamPowerSpeed: number; readonly slamEmpowerAt: number;
  readonly launchMinUpSpeed: number; readonly risingSpeedReference: number;
  readonly slamColor: string; readonly updraftColor: string;
}): ReticleSnapshot {
  let power: ReticleSnapshot["power"];
  if (input.airborne && input.blade.state === "held") {
    if (input.blade.tipVY > input.slamMinDownSpeed * 0.7 && input.playerVerticalSpeed > input.slamPowerSpeed * input.slamEmpowerAt) power = "slam";
    else if (input.blade.tipVY < -input.launchMinUpSpeed * 0.7 && -input.playerVerticalSpeed > input.risingSpeedReference * 0.45) power = "updraft";
  }
  return Object.freeze({ x: input.blade.reticleX, y: input.blade.reticleY, power,
    slamColor: input.slamColor, updraftColor: input.updraftColor });
}
