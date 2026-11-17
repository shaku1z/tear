import { getNowPlaying, type NowPlaying } from "../audio/music/now-playing";
import type { MenuScreenView, SetupScreenView } from "./screens/contracts";
import type { SurfaceAvailability } from "../domain/surface-availability";
import { FIRST_RUN_PLAY_LABEL, FIRST_RUN_SETUP_GUIDANCE } from "../gameplay/progression/first-run-guidance";

/** `debug` is the runtime projection of an engineering-surface mode (Boss Test, Enemy Test). */
export interface MenuModeSource {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly debug?: boolean;
}
type Surfaces = Pick<SurfaceAvailability, "allows" | "admits">;
const modeAvailable = (entry: MenuModeSource, surfaces: Surfaces): boolean =>
  surfaces.admits(entry.debug === true ? "engineering" : "release");
/** Modes that may create a Seed-Locked Race reference. */
const RACE_MODE_IDS: readonly string[] = Object.freeze(["endless", "campaign", "gauntlet", "bossonly"]);
export interface MenuDifficultySource {
  readonly id: string;
  readonly label: string;
  readonly desc: string;
  readonly mods: Readonly<{ score: number; coin: number }>;
}
export interface WeaponChoiceSource {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly tags: readonly string[];
  readonly throwIdentity: string;
  readonly ratings?: Readonly<{ handling: number; impact: number; reach: number; difficulty: number }>;
  readonly weaknesses?: readonly string[];
}
export interface BestSetupSource {
  readonly wave: number;
  readonly score: number;
  readonly time?: number;
}
export interface BossChoiceSource {
  readonly id: string;
  readonly name: string;
}
export interface BountyChoiceSource {
  readonly label: string;
  readonly detail: string;
  readonly done: boolean;
}

/** The menu music row: always "MUSIC", with the sounding track (or a plain empty state) underneath. */
export function menuMusicRow(state: NowPlaying): Readonly<{ label: string; detail: string }> {
  if (!state.workId) return Object.freeze({ label: "MUSIC", detail: "nothing playing yet" });
  const station = state.stationName ? ` · ${state.stationName}` : "";
  return Object.freeze({ label: "MUSIC", detail: `${state.title.toUpperCase()}${station}` });
}

export function buildMenuSnapshot(input: {
  readonly tutorialDone?: number;
  /** The profile has never finished the tutorial and has no other history (see first-run-guidance). */
  readonly firstRun?: boolean;
  readonly username: string;
  readonly campaignEmblem: boolean;
  readonly signedIn: boolean;
  readonly coins: number;
  readonly shards: number;
  readonly unlocked: number;
  readonly selectedMode: string;
  readonly selectedDifficulty: string;
  readonly modes: readonly MenuModeSource[];
  readonly difficulties: readonly MenuDifficultySource[];
  readonly biome: string;
  readonly pendingFinale: boolean;
  readonly surfaces: Surfaces;
}): MenuScreenView {
  return Object.freeze({
    id: "menu",
    nowPlaying: menuMusicRow(getNowPlaying()),
    playerName: (input.campaignEmblem ? "◇ " : "") + (input.username || "GUEST"),
    ...(Number.isSafeInteger(input.tutorialDone) && (input.tutorialDone ?? 0) > 0 ? { practiceAvailable: true } : {}),
    signedIn: input.signedIn,
    coins: input.coins,
    shards: input.shards,
    unlocked: input.unlocked,
    modeLabel: input.modes.find((entry) => entry.id === input.selectedMode)?.label ?? "Endless",
    difficultyLabel: input.difficulties.find((entry) => entry.id === input.selectedDifficulty)?.label ?? "Normal",
    ...(input.firstRun === true && input.selectedMode === "tutorial" ? { playSub: FIRST_RUN_PLAY_LABEL } : {}),
    biome: input.biome,
    pendingFinale: input.pendingFinale,
  });
}

const modeTrim: Readonly<Record<string, Readonly<{ glyph: string; sub: string }>>> = Object.freeze({
  campaign: { glyph: "▲", sub: "stage after stage, ever deeper" },
  endless: { glyph: "∞", sub: "biomes cycle — chase your best" },
  gauntlet: { glyph: "☠", sub: "a full boss every 8 waves" },
  playground: { glyph: "✦", sub: "open arena — test everything" },
  tutorial: { glyph: "➔", sub: "learn the blade" },
});

/** The personal-best line under the BEGIN button for the selected board. */
function setupBestSummary(best: BestSetupSource, formatTime: (seconds: number) => string): string {
  if (!best.wave && !best.score) return "YOUR BEST · no record on this board yet";
  return (
    "YOUR BEST · wave " +
    String(best.wave) +
    " · " +
    best.score.toLocaleString("en-US") +
    " pts · " +
    formatTime(best.time ?? 0)
  );
}

export function buildSetupSnapshot(input: {
  readonly tutorialDone?: number;
  readonly firstRun?: boolean;
  readonly selectedMode: string;
  readonly selectedDifficulty: string;
  readonly selectedWeapon: string;
  readonly selectedBoss: string;
  readonly startGlyph: string;
  readonly modes: readonly MenuModeSource[];
  readonly difficulties: readonly MenuDifficultySource[];
  readonly weapons: readonly WeaponChoiceSource[];
  readonly bosses: readonly BossChoiceSource[];
  readonly bounties?: readonly BountyChoiceSource[];
  readonly surfaces: Surfaces;
  readonly best: BestSetupSource;
  readonly formatTime: (seconds: number) => string;
}): SetupScreenView {
  const showDifficulty = input.selectedMode !== "tutorial" && input.selectedMode !== "playground";
  const modes = input.modes.filter((entry) => modeAvailable(entry, input.surfaces));
  const mode = modes.find((entry) => entry.id === input.selectedMode);
  const difficulty = input.difficulties.find((entry) => entry.id === input.selectedDifficulty);
  const weapon = input.weapons.find((entry) => entry.id === input.selectedWeapon);
  const bossChoices =
    input.selectedMode === "bossonly" && mode !== undefined && input.surfaces.allows("setup:boss-picker")
      ? [
          { id: "shuffle", label: "SHUFFLE", selected: input.selectedBoss === "shuffle" },
          ...input.bosses.map((boss) => ({
            id: boss.id,
            label: boss.name.toUpperCase(),
            selected: input.selectedBoss === boss.id,
          })),
        ]
      : undefined;
  return Object.freeze({
    id: "setup",
    ...(Number.isSafeInteger(input.tutorialDone) && (input.tutorialDone ?? 0) > 0 ? { practiceAvailable: true } : {}),
    modes: modes.map((entry) => ({
      id: entry.id,
      label: entry.label,
      description: entry.blurb,
      glyph: modeTrim[entry.id]?.glyph,
      sub: modeTrim[entry.id]?.sub,
      selected: entry.id === input.selectedMode,
      ...(entry.debug === true ? { debug: true } : {}),
    })),
    difficulties: input.difficulties.map((entry) => ({
      id: entry.id,
      label: entry.label,
      description: entry.desc,
      sub:
        "×" +
        entry.mods.score.toFixed(1) +
        " score · " +
        (entry.id === "onehit" ? "coins ×0.7→3.1" : "×" + entry.mods.coin.toFixed(2).replace(/0$/, "") + " coins"),
      selected: entry.id === input.selectedDifficulty,
    })),
    weapons: input.weapons.map((entry) => ({
      id: entry.id,
      label: entry.name,
      description: entry.blurb,
      sub: entry.tags.join(" · ").toUpperCase(),
      selected: entry.id === input.selectedWeapon,
      ...(entry.ratings === undefined
        ? {}
        : {
            detail:
              `Handling ${String(entry.ratings.handling)} · Impact ${String(entry.ratings.impact)} · Reach ${String(entry.ratings.reach)} · Difficulty ${String(entry.ratings.difficulty)}` +
              (entry.weaknesses?.length ? `\nWeak: ${entry.weaknesses.join(", ").toLowerCase()}` : ""),
          }),
    })),
    showDifficulty,
    startGlyph: input.startGlyph,
    ...(input.firstRun === true && input.selectedMode === "tutorial" ? { guidance: FIRST_RUN_SETUP_GUIDANCE } : {}),
    startSummary: (
      (mode?.label ?? "") +
      " · " +
      (showDifficulty && difficulty !== undefined ? difficulty.label + " · " : "") +
      (weapon?.name ?? "")
    ).toUpperCase(),
    ...(showDifficulty ? { bestSummary: setupBestSummary(input.best, input.formatTime) } : {}),
    ...(bossChoices === undefined ? {} : { bossChoices }),
    ...(mode !== undefined && RACE_MODE_IDS.includes(mode.id) && input.surfaces.allows("feature:seed-race")
      ? { raceAvailable: true }
      : {}),
    // Training modes (tutorial, playground) award no bounties: they are not shown there.
    ...(input.bounties === undefined || !showDifficulty ? {} : { bounties: input.bounties }),
  });
}
