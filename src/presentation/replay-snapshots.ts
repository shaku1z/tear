import type { ReplayScreenView } from "./screens/contracts";
import type { UpgradeCategoryPresentation, UpgradePresentationSource } from "./run-screen-snapshots";

export interface ReplayDataSource {
  readonly name?: string; readonly mode?: string; readonly wave?: number; readonly score?: number; readonly won?: boolean;
  readonly kills?: number; readonly peak?: number; readonly time?: number;
  readonly loadout?: readonly Readonly<{ id: string; tier?: number; n?: number }>[];
  readonly finalLoadout?: readonly Readonly<{ id: string; tier?: number; n?: number }>[];
}
export interface ReplayPlaybackSource { readonly t: number; readonly playing: boolean; readonly speed: number }
export interface ReplayChapterSource { readonly t: number; readonly boss?: boolean }
export function buildReplayScreenSnapshot(input: {
  readonly data: ReplayDataSource; readonly modeLabel: string; readonly playback?: ReplayPlaybackSource;
  readonly duration: number; readonly progress: number; readonly stageName: string; readonly wave: number;
  readonly chapters: readonly ReplayChapterSource[]; readonly infoVisible: boolean;
  readonly upgrades: readonly UpgradePresentationSource[]; readonly categories: Readonly<Record<string, UpgradeCategoryPresentation>>;
  readonly fallbackCategory: UpgradeCategoryPresentation; readonly specialColor: string; readonly formatTime: (seconds: number) => string;
}): ReplayScreenView {
  const data = input.data;
  const infoRows = [
    { label: "PLAYER", value: data.name ?? "Player" },
    { label: "RESULT", value: data.won ? "VICTORY" : "wave " + String(data.wave ?? 0) },
    { label: "SCORE", value: String(data.score ?? 0) },
    { label: "KILLS", value: data.kills === undefined ? "—" : String(data.kills) },
    { label: "PEAK MULTIPLIER", value: "×" + String(data.peak ?? 1) },
    { label: "TIME", value: input.formatTime(data.time ?? input.duration) },
  ];
  const finalItems = new Map<string, { id: string; tier: number; n: number }>();
  for (const item of data.finalLoadout ?? data.loadout ?? []) {
    const previous = finalItems.get(item.id);
    finalItems.set(item.id, { id: item.id, tier: item.tier ?? previous?.tier ?? 1,
      n: item.n ?? ((previous?.n ?? 0) + 1) });
  }
  const loadout = [...finalItems.values()].flatMap((item) => {
    const upgrade = input.upgrades.find((entry) => entry.id === item.id);
    if (upgrade === undefined) return [];
    const category = input.categories[upgrade.cat] ?? input.fallbackCategory;
    return [{ id: item.id, label: upgrade.name, accent: upgrade.tiers !== undefined ? input.specialColor : category.color,
      footer: upgrade.tiers !== undefined ? "TIER " + String(item.tier) : (upgrade.unique ? "UNIQUE" : "×" + String(item.n)) }];
  });
  return Object.freeze({ id: "replay", title: data.name ?? "Player",
    detail: input.modeLabel + " · wave " + String(data.wave ?? 0) + " · " + String(data.score ?? 0) + " pts" + (data.won ? " · ★ VICTORY" : ""),
    paused: input.playback?.playing !== true, speed: input.playback?.speed ?? 1,
    elapsed: input.formatTime(input.playback?.t ?? 0), duration: input.formatTime(input.duration), progress: input.progress,
    stage: input.stageName, score: "WAVE " + String(input.wave),
    chapters: input.chapters.map((chapter) => ({ fraction: chapter.t / Math.max(input.duration, 0.001), boss: chapter.boss === true })),
    wave: input.wave, infoVisible: input.infoVisible, infoRows, loadout });
}
