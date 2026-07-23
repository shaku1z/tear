import type { MenuScreenView, SetupScreenView } from "./screens/contracts";

export interface MenuModeSource { readonly id: string; readonly label: string; readonly blurb: string; readonly debug?: boolean }
export interface MenuDifficultySource { readonly id: string; readonly label: string; readonly desc: string;
  readonly mods: Readonly<{ score: number; coin: number }> }
export interface WeaponChoiceSource { readonly id: string; readonly name: string; readonly blurb: string;
  readonly tags: readonly string[]; readonly throwIdentity: string }
export interface BestSetupSource { readonly wave: number; readonly score: number; readonly time?: number }
export interface BossChoiceSource { readonly id: string; readonly name: string }
export interface BountyChoiceSource { readonly label: string; readonly detail: string; readonly done: boolean }

export function buildMenuSnapshot(input: {
  readonly username: string; readonly campaignEmblem: boolean; readonly signedIn: boolean;
  readonly coins: number; readonly shards: number; readonly unlocked: number;
  readonly selectedMode: string; readonly selectedDifficulty: string;
  readonly modes: readonly MenuModeSource[]; readonly difficulties: readonly MenuDifficultySource[];
  readonly biome: string; readonly pendingFinale: boolean;
}): MenuScreenView {
  return Object.freeze({ id: "menu", playerName: (input.campaignEmblem ? "◇ " : "") + (input.username || "GUEST"),
    signedIn: input.signedIn, coins: input.coins, shards: input.shards, unlocked: input.unlocked,
    modeLabel: input.modes.find((entry) => entry.id === input.selectedMode)?.label ?? "Endless",
    difficultyLabel: input.difficulties.find((entry) => entry.id === input.selectedDifficulty)?.label ?? "Normal",
    biome: input.biome, pendingFinale: input.pendingFinale });
}

const modeTrim: Readonly<Record<string, Readonly<{ glyph: string; sub: string }>>> = Object.freeze({
  campaign: { glyph: "▲", sub: "stage after stage, ever deeper" }, endless: { glyph: "∞", sub: "biomes cycle — chase your best" },
  gauntlet: { glyph: "☠", sub: "a full boss every 8 waves" }, playground: { glyph: "✦", sub: "open arena — test everything" },
  tutorial: { glyph: "➔", sub: "learn the blade" },
});

export function buildSetupSnapshot(input: {
  readonly selectedMode: string; readonly selectedDifficulty: string; readonly selectedWeapon: string; readonly selectedBoss: string;
  readonly modes: readonly MenuModeSource[]; readonly difficulties: readonly MenuDifficultySource[]; readonly weapons: readonly WeaponChoiceSource[];
  readonly bosses: readonly BossChoiceSource[]; readonly bounties?: readonly BountyChoiceSource[]; readonly livePlatform: boolean;
  readonly best: BestSetupSource; readonly formatTime: (seconds: number) => string;
}): SetupScreenView {
  const showDifficulty = input.selectedMode !== "tutorial" && input.selectedMode !== "playground";
  const mode = input.modes.find((entry) => entry.id === input.selectedMode);
  const difficulty = input.difficulties.find((entry) => entry.id === input.selectedDifficulty);
  const weapon = input.weapons.find((entry) => entry.id === input.selectedWeapon);
  const bossChoices = input.selectedMode === "bossonly"
    ? [{ id: "shuffle", label: "SHUFFLE", selected: input.selectedBoss === "shuffle" },
      ...input.bosses.map((boss) => ({ id: boss.id, label: boss.name.toUpperCase(), selected: input.selectedBoss === boss.id }))]
    : undefined;
  return Object.freeze({ id: "setup",
    modes: input.modes.filter((entry) => !entry.debug || !input.livePlatform).map((entry) => ({ id: entry.id, label: entry.label,
      description: entry.blurb, glyph: modeTrim[entry.id]?.glyph, sub: modeTrim[entry.id]?.sub, selected: entry.id === input.selectedMode,
      ...(entry.debug === true ? { debug: true } : {}) })),
    difficulties: input.difficulties.map((entry) => ({ id: entry.id, label: entry.label, description: entry.desc,
      sub: "×" + entry.mods.score.toFixed(1) + " score · " + (entry.id === "onehit" ? "×0.7→3.1 coins after wave 8" : "×" + entry.mods.coin.toFixed(2).replace(/0$/, "") + " coins"),
      selected: entry.id === input.selectedDifficulty })),
    weapons: input.weapons.map((entry) => ({ id: entry.id, label: entry.name, description: entry.blurb,
      sub: entry.tags.join(" · ") + " — " + entry.throwIdentity, selected: entry.id === input.selectedWeapon })),
    showDifficulty, startSummary: ((mode?.label ?? "") + " · " + (showDifficulty && difficulty !== undefined ? difficulty.label + " · " : "") + (weapon?.name ?? "")).toUpperCase(),
    bestSummary: input.best.wave || input.best.score ? "YOUR BEST · wave " + String(input.best.wave) + " · " + String(input.best.score) + " pts · " + input.formatTime(input.best.time ?? 0)
      : "YOUR BEST · no record on this board yet",
    ...(bossChoices === undefined ? {} : { bossChoices }),
    ...(input.bounties === undefined ? {} : { bounties: input.bounties }) });
}
