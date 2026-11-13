import { PLAYGROUND_TABS } from "./runtime-bridge";

export interface PlaygroundChoice {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean;
  readonly accent?: string;
  readonly description?: string;
  readonly sub?: string;
  readonly glyph?: string;
  readonly enabled?: boolean;
}
export interface PlaygroundSection {
  readonly label: string;
  readonly choices: readonly PlaygroundChoice[];
}
export interface PlaygroundScreenModel {
  readonly id: "pgmenu" | "pglab";
  readonly title: string;
  readonly subtitle: string;
  /** The menu's tabs; the selected one is the page on screen. */
  readonly tabs: readonly Readonly<{ id: string; label: string; selected: boolean }>[];
  readonly sections: readonly PlaygroundSection[];
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
}
export interface PlaygroundPresentationRun {
  diff: string;
  pgArena?: number;
  pg: Readonly<{ hpMultiplier?: number; count?: number; god?: boolean; freeze?: boolean; slow?: boolean }>;
  mods: Readonly<{ owned: Readonly<Record<string, number>>; tier: Readonly<Record<string, number>> }>;
}
export interface PlaygroundPresentationUpgrade {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly cat: string;
  readonly unique?: boolean;
  readonly tiers?: readonly unknown[];
}
/** The device that owns input; the build-menu subtitle only names controls that work on it. */
export type PlaygroundPromptDevice = "mouse" | "keyboard" | "gamepad" | "touch";

/**
 * One line under the title: how to switch tabs and how to leave, for the device in use.
 * Tab and Escape close the menu from a keyboard; touch and controller players leave
 * through the RESUME button.
 */
export function playgroundMenuSubtitle(device: PlaygroundPromptDevice): string {
  return device === "mouse" || device === "keyboard"
    ? "Q / E switch tabs · Tab or Esc returns to the arena"
    : device === "gamepad"
      ? "L1 / R1 switch tabs · RESUME returns to the arena"
      : "RESUME returns to the arena";
}

/** Keyboard shortcuts in the arena, shown on the choice they repeat (keyboard only). */
export const PLAYGROUND_SHORTCUTS: Readonly<Record<string, string>> = Object.freeze({
  dummy: "T",
  "boss:next": "B",
  "boss:echo": "M",
  clear: "K",
  heal: "H",
  "tab:abilities": "U",
});

function menuTabs(selected: string): PlaygroundScreenModel["tabs"] {
  return PLAYGROUND_TABS.map(([id, label]) => ({ id: `tab:${id}`, label, selected: id === selected }));
}

export interface LivePlaygroundPresentationOptions {
  readonly run: () => PlaygroundPresentationRun;
  readonly inputDevice: () => PlaygroundPromptDevice;
  readonly oneHit: () => boolean;
  readonly kinds: readonly string[];
  readonly difficulties: () => readonly Readonly<{ id: string; label: string }>[];
  readonly bosses: readonly Readonly<{ id: string; name: string }>[];
  readonly weapons: () => readonly Readonly<{ id: string; name: string }>[];
  readonly colors: () => Readonly<Record<string, string>>;
  readonly uiAccent: () => string;
  readonly stageAccent: () => string;
  readonly arenaName: () => string;
  /** Every arena the Playground can use, in stage order. */
  readonly arenas: () => readonly string[];
  readonly tab: () => string;
  /** The enemy kinds bound to the number keys, in key order. */
  readonly hotkeyKinds: readonly string[];
  readonly selectedWeapon: () => string;
  readonly upgrades: () => readonly PlaygroundPresentationUpgrade[];
  readonly abilityColors: () => Readonly<Record<string, Readonly<{ color: string }>>>;
  readonly labFilter: () => string;
  readonly viewportHeight: number;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly renderMenu: (model: PlaygroundScreenModel) => void;
  readonly renderLab: (model: PlaygroundScreenModel) => void;
}

export function createLivePlaygroundPresentation(options: LivePlaygroundPresentationOptions): Readonly<{
  renderMenu(): void;
  renderLab(): void;
}> {
  return Object.freeze({
    renderMenu() {
      const run = options.run(),
        pg = run.pg,
        colors = options.colors(),
        device = options.inputDevice(),
        keyboard = device === "mouse" || device === "keyboard",
        tab = options.tab();
      const key = (id: string, hotkey = PLAYGROUND_SHORTCUTS[id]) =>
        keyboard && hotkey !== undefined ? { sub: `KEY ${hotkey}` } : {};
      const pages: Readonly<Record<string, readonly PlaygroundSection[]>> = {
        spawn: [
          {
            label: "ENEMIES",
            choices: [
              ...options.kinds.map((kind) => {
                const index = options.hotkeyKinds.indexOf(kind);
                return {
                  id: `spawn:${kind}`,
                  label: kind.toUpperCase(),
                  accent: colors[kind] ?? "#888",
                  ...key(kind, index < 0 ? undefined : String(index + 1)),
                };
              }),
              { id: "dummy", label: "TARGET DUMMY", accent: "#888", ...key("dummy") },
            ],
          },
          {
            label: "HEALTH",
            choices: [1, 3, 10].map((value) => ({
              id: `hp:${String(value)}`,
              label: `×${String(value)}`,
              selected: (pg.hpMultiplier ?? 1) === value,
            })),
          },
          {
            label: "HOW MANY",
            choices: [1, 5].map((value) => ({
              id: `count:${String(value)}`,
              label: `×${String(value)}`,
              selected: (pg.count ?? 1) === value,
            })),
          },
          {
            label: "DIFFICULTY",
            choices: options.difficulties().map((difficulty) => ({
              id: `difficulty:${difficulty.id}`,
              label: difficulty.label.toUpperCase(),
              selected: run.diff === difficulty.id,
            })),
          },
        ],
        bosses: [
          {
            label: "SUMMON A BOSS",
            choices: [
              ...options.bosses.map((boss) => ({
                id: `boss:${boss.id}`,
                label: boss.name.toUpperCase(),
                accent: colors.boss ?? options.uiAccent(),
              })),
              { id: "boss:echo", label: "THE ECHO", accent: "#b06cff", ...key("boss:echo") },
            ],
          },
        ],
        arena: [
          {
            label: "ARENA",
            choices: options.arenas().map((name, index) => ({
              id: `arena:${String(index)}`,
              label: name.toUpperCase(),
              selected: Math.max(0, run.pgArena ?? 0) === index,
              accent: options.stageAccent(),
            })),
          },
        ],
        weapon: [
          {
            label: "WEAPON · CHANGING IT RESTARTS THE ARENA",
            choices: options.weapons().map((weapon) => ({
              id: `weapon:${weapon.id}`,
              label: weapon.name.toUpperCase(),
              selected: options.selectedWeapon() === weapon.id,
            })),
          },
        ],
        rules: [
          {
            label: "RULES",
            choices: [
              { id: "toggle:god", label: "NO DAMAGE", selected: Boolean(pg.god) },
              { id: "toggle:freeze", label: "FREEZE ENEMIES", selected: Boolean(pg.freeze) },
              { id: "toggle:slow", label: "SLOW MOTION", selected: Boolean(pg.slow) },
              { id: "toggle:onehit", label: "ONE-HIT MODE", selected: options.oneHit() },
            ],
          },
          {
            label: "ARENA ACTIONS",
            choices: [
              { id: "clear", label: "CLEAR ENEMIES", ...key("clear") },
              { id: "heal", label: "FULL HEAL", ...key("heal") },
              { id: "reset", label: "RESET PLAYGROUND" },
            ],
          },
        ],
      };
      options.renderMenu({
        id: "pgmenu",
        title: "PLAYGROUND",
        subtitle: playgroundMenuSubtitle(device),
        tabs: menuTabs(tab),
        sections: pages[tab] ?? pages.spawn ?? [],
      });
    },
    renderLab() {
      const categories = ["all", "offense", "parry", "throw", "mobility", "resilience", "utility"],
        filter = options.labFilter();
      options.tab();
      const upgrades = options.upgrades().filter((upgrade) => filter === "all" || upgrade.cat === filter);
      const maxScroll = Math.max(0, Math.ceil(upgrades.length / 2) * 92 - (options.viewportHeight - 350));
      const scroll = Math.min(maxScroll, Math.max(0, options.scroll()));
      options.setScroll(scroll);
      const run = options.run(),
        colors = options.abilityColors();
      options.renderLab({
        id: "pglab",
        title: "PLAYGROUND",
        subtitle: "Take or evolve any ability · " + playgroundMenuSubtitle(options.inputDevice()),
        tabs: menuTabs("abilities"),
        sections: [
          {
            label: "FILTERS",
            choices: categories.map((category) => ({
              id: `filter:${category}`,
              label: category.toUpperCase(),
              selected: category === filter,
            })),
          },
          {
            label: "ABILITIES",
            choices: upgrades.map((upgrade) => {
              const owned = run.mods.owned[upgrade.id] ?? 0,
                tier = run.mods.tier[upgrade.id] ?? 0,
                maxTier = upgrade.tiers ? upgrade.tiers.length + 1 : 1;
              let glyph = "TAKE",
                enabled = true;
              if (owned && upgrade.tiers) {
                if (tier < maxTier) glyph = "EVOLVE";
                else {
                  glyph = "MAX";
                  enabled = false;
                }
              } else if (owned && upgrade.unique) {
                glyph = "OWNED";
                enabled = false;
              } else if (owned) glyph = "+1";
              const sub = owned
                ? upgrade.tiers
                  ? `TIER ${String(tier)} / ${String(maxTier)}`
                  : upgrade.unique
                    ? "OWNED"
                    : `OWNED ×${String(owned)}`
                : null;
              const accent = (colors[upgrade.cat] ?? colors.utility)?.color;
              return {
                id: `ability:${upgrade.id}`,
                label: upgrade.name + (upgrade.tiers ? " ★" : ""),
                description: upgrade.desc,
                ...(sub === null ? {} : { sub }),
                glyph,
                ...(accent === undefined ? {} : { accent }),
                enabled,
              };
            }),
          },
        ],
        canScrollUp: scroll > 0,
        canScrollDown: maxScroll > scroll,
      });
    },
  });
}
