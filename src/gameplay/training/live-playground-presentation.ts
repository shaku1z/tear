export interface PlaygroundChoice {
  readonly id: string; readonly label: string; readonly selected?: boolean; readonly accent?: string;
  readonly description?: string; readonly sub?: string; readonly glyph?: string; readonly enabled?: boolean;
}
export interface PlaygroundSection { readonly label: string; readonly choices: readonly PlaygroundChoice[] }
export interface PlaygroundScreenModel {
  readonly id: "pgmenu" | "pglab"; readonly title: string; readonly subtitle: string;
  readonly sections: readonly PlaygroundSection[]; readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
}
export interface PlaygroundPresentationRun {
  diff: string; pgArena?: number; pg: Readonly<{ hpMultiplier?: number; count?: number; god?: boolean; freeze?: boolean; slow?: boolean }>;
  mods: Readonly<{ owned: Readonly<Record<string, number>>; tier: Readonly<Record<string, number>> }>;
}
export interface PlaygroundPresentationUpgrade {
  readonly id: string; readonly name: string; readonly desc: string; readonly cat: string;
  readonly unique?: boolean; readonly tiers?: readonly unknown[];
}
export interface LivePlaygroundPresentationOptions {
  readonly run: () => PlaygroundPresentationRun;
  readonly oneHit: () => boolean;
  readonly kinds: readonly string[];
  readonly difficulties: () => readonly Readonly<{ id: string; label: string }>[];
  readonly bosses: readonly Readonly<{ id: string; name: string }>[];
  readonly weapons: () => readonly Readonly<{ id: string; name: string }>[];
  readonly colors: () => Readonly<Record<string, string>>;
  readonly uiAccent: () => string;
  readonly stageAccent: () => string;
  readonly arenaName: () => string;
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
  renderMenu(): void; renderLab(): void;
}> {
  return Object.freeze({
    renderMenu() {
      const run = options.run(), pg = run.pg, colors = options.colors();
      options.renderMenu({ id: "pgmenu", title: "PLAYGROUND", subtitle: "build the scene — Tab / Esc resumes", sections: [
        { label: "SPAWN ENEMIES", choices: [...options.kinds.map((kind) => ({ id: `spawn:${kind}`, label: kind.toUpperCase(), accent: colors[kind] ?? "#888" })),
          { id: "dummy", label: "TARGET DUMMY  (passive)", accent: "#888" }] },
        { label: "SPAWN MODIFIERS", choices: [
          ...[1, 3, 10].map((value) => ({ id: `hp:${String(value)}`, label: `HP ×${String(value)}`, selected: (pg.hpMultiplier ?? 1) === value })),
          ...[1, 5].map((value) => ({ id: `count:${String(value)}`, label: `COUNT ×${String(value)}`, selected: (pg.count ?? 1) === value }))] },
        { label: "DIFFICULTY", choices: options.difficulties().map((difficulty) =>
          ({ id: `difficulty:${difficulty.id}`, label: difficulty.label.toUpperCase(), selected: run.diff === difficulty.id })) },
        { label: "SUMMON A BOSS", choices: options.bosses.map((boss) => ({ id: `boss:${boss.id}`, label: boss.name.toUpperCase(), accent: colors.boss ?? options.uiAccent() })) },
        { label: "ARENA", choices: [{ id: "arena", label: `NEXT ARENA  ›  now: ${options.arenaName()}`,
          accent: run.pgArena === -1 || run.pgArena == null ? options.uiAccent() : options.stageAccent() }] },
        { label: "WEAPON  (restarts the arena)", choices:
          options.weapons().map((weapon) => ({ id: `weapon:${weapon.id}`, label: weapon.name.toUpperCase(), selected: options.selectedWeapon() === weapon.id })) },
        { label: "MODIFIERS", choices: [{ id: "toggle:god", label: "GOD MODE", selected: Boolean(pg.god) },
          { id: "toggle:freeze", label: "FREEZE ENEMIES", selected: Boolean(pg.freeze) }, { id: "toggle:slow", label: "SLOW MOTION", selected: Boolean(pg.slow) },
          { id: "toggle:onehit", label: "ONE-HIT MODE", selected: options.oneHit() }] },
        { label: "ACTIONS", choices: [{ id: "lab", label: "ABILITY LAB ›" }, { id: "clear", label: "CLEAR ENEMIES" },
          { id: "heal", label: "FULL HEAL" }, { id: "reset", label: "RESET PLAYGROUND" }] },
      ] });
    },
    renderLab() {
      const categories = ["all", "offense", "parry", "throw", "mobility", "resilience", "utility"], filter = options.labFilter();
      const upgrades = options.upgrades().filter((upgrade) => filter === "all" || upgrade.cat === filter);
      const maxScroll = Math.max(0, Math.ceil(upgrades.length / 2) * 92 - (options.viewportHeight - 350));
      const scroll = Math.min(maxScroll, Math.max(0, options.scroll())); options.setScroll(scroll);
      const run = options.run(), colors = options.abilityColors();
      options.renderLab({ id: "pglab", title: "ABILITY LAB", subtitle: "take anything · evolve anything · no waves, just you", sections: [
        { label: "FILTERS", choices: categories.map((category) => ({ id: `filter:${category}`, label: category.toUpperCase(), selected: category === filter })) },
        { label: "ABILITIES", choices: upgrades.map((upgrade) => {
          const owned = run.mods.owned[upgrade.id] ?? 0, tier = run.mods.tier[upgrade.id] ?? 0, maxTier = upgrade.tiers ? upgrade.tiers.length + 1 : 1;
          let glyph = "TAKE", enabled = true;
          if (owned && upgrade.tiers) { if (tier < maxTier) glyph = "EVOLVE"; else { glyph = "MAX"; enabled = false; } }
          else if (owned && upgrade.unique) { glyph = "OWNED"; enabled = false; } else if (owned) glyph = "+1";
          const sub = owned ? (upgrade.tiers ? `TIER ${String(tier)} / ${String(maxTier)}` : upgrade.unique ? "OWNED" : `OWNED ×${String(owned)}`) : null;
          const accent = (colors[upgrade.cat] ?? colors.utility)?.color;
          return { id: `ability:${upgrade.id}`, label: upgrade.name + (upgrade.tiers ? " ★" : ""), description: upgrade.desc,
            ...(sub === null ? {} : { sub }), glyph, ...(accent === undefined ? {} : { accent }), enabled };
        }) },
      ], canScrollUp: scroll > 0, canScrollDown: maxScroll > scroll });
    },
  });
}
