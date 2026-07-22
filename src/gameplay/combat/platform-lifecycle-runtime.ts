export interface CrackingPlatform {
  x: number; y: number; w: number; h: number; oneway?: boolean; arenaPlatId?: string;
  crackT?: number; crackColor?: string | null; respawnIn?: number;
}

export interface BrokenPlatform { readonly spec: CrackingPlatform; t: number }

export type PlatformLifecycleIntent =
  | Readonly<{ type: "break"; platform: CrackingPlatform; color: string | null }>
  | Readonly<{ type: "reform"; platform: CrackingPlatform }>;

export function advancePlatformLifecycle(platforms: CrackingPlatform[], broken: BrokenPlatform[], dt: number): readonly PlatformLifecycleIntent[] {
  const intents: PlatformLifecycleIntent[] = [];
  for (let index = platforms.length - 1; index >= 0; index--) {
    const platform = platforms[index];
    if (!platform || platform.arenaPlatId || !(platform.crackT && platform.crackT > 0)) continue;
    platform.crackT -= dt;
    if (platform.crackT <= 0 && platform.oneway === true) {
      const spec: CrackingPlatform = { x: platform.x, y: platform.y, w: platform.w, h: platform.h, oneway: true };
      platforms.splice(index, 1); intents.push({ type: "break", platform: spec, color: platform.crackColor ?? null });
      if (platform.respawnIn && platform.respawnIn > 0) broken.push({ spec, t: platform.respawnIn });
    }
  }
  for (let index = broken.length - 1; index >= 0; index--) {
    const entry = broken[index]; if (!entry) continue;
    entry.t -= dt;
    if (entry.t <= 0) {
      const platform = { ...entry.spec }; platforms.push(platform); broken.splice(index, 1);
      intents.push({ type: "reform", platform });
    }
  }
  return intents;
}
