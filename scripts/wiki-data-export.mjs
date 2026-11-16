import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * The player wiki document (`--wiki`): the reference above plus the facts the
 * Codex shows players, read from the same sources the game uses — base stats
 * from real constructed instances, Codex copy, shop items with per-level costs,
 * controls, style scoring and the terminology registry.
 */
export async function encodeWikiData(server, reference, { modeModule, variantModule, affixModule }, dirty = false) {
  const load = (file) => server.ssrLoadModule(file);
  const wiki = await load("/src/game-reference/wiki-data.ts");
  const { CONFIG } = await load("/src/config/game-config.ts");
  const bestiary = await load("/src/presentation/bestiary-catalog.ts");
  const director = await load("/src/gameplay/run/content-director.ts");
  const { createProductionReplayWorld } = await load("/src/tearbench/production-world-factory.ts");
  const { buildCodexGuide } = await load("/src/presentation/codex-snapshots.ts");
  const { SHOP_CATEGORIES } = await load("/src/presentation/shop-snapshot.ts");
  const { createMetaProgression } = await load("/src/gameplay/progression/meta.ts");
  const { createBrowserGamepad } = await load("/src/input/browser-gamepad.ts");

  // Base stats: build every published enemy and boss through the game's own
  // by-id entity factory (the one the live world uses), over every enemy type
  // the game defines, and read the constructed instance.
  const world = createProductionReplayWorld({ seed: "wiki" });
  const { createLiveWorldEntityFactory } = await load("/src/app/world/world-entity-factory.ts");
  const { planBossPlacement } = await load("/src/gameplay/run/boss-placement.ts");
  const entities = createLiveWorldEntityFactory({ ...world.factories.enemyTypes, ...world.factories.mirrorTypes });
  const measure = (factoryId) => {
    const instance = entities.createEnemy(factoryId, 0, 0, world.run);
    return { hp: instance.maxHp, contactDamage: instance.contactDmg, speed: instance.speed ?? 0 };
  };
  const bossIds = reference.collections.bosses.items.map((boss) => boss.id);
  const bodies = Object.fromEntries([
    ...director.PUBLISHED_ENEMY_IDENTITY_IDS.map((id) => [id, measure(id)]),
    ...bossIds.map((id) => [id, measure(planBossPlacement(id, CONFIG.view.w, CONFIG).factoryId)]),
  ]);

  // Shop: the real item list and cost formula, evaluated at every level.
  const store = { get: () => null, set: () => undefined };
  const { META, SHOP } = createMetaProgression({
    store,
    config: CONFIG,
    cloud: { push: () => undefined, pull: async () => null },
    random: { next: () => 0 },
    upgrades: [],
    applyUpgrade: () => undefined,
  });
  const shop = SHOP.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.cat,
    glyph: item.glyph,
    desc: item.desc,
    levels: Array.from({ length: item.maxLevel }, (_, level) => {
      META.data.buy = { [item.id]: level };
      return { cost: META.cost(item), effect: item.now(level + 1) };
    }),
  }));

  // Controls: the Codex guide (keyboard/mouse) and the shipped controller preset.
  const padHost = {};
  const { PAD, PAD_PRESETS } = createBrowserGamepad({
    config: padHost,
    input: { held: new Set() },
    window: { addEventListener: () => undefined },
    navigator: { getGamepads: () => [] },
    semantic: {},
  });
  const glyphs = (style, buttons) => {
    padHost.pad.glyphStyle = style;
    return buttons.map((button) => PAD.glyph(button));
  };
  const preset = PAD_PRESETS.default;
  const gamepad = Object.entries(preset).map(([action, buttons]) => ({
    action,
    buttons: glyphs("xbox", buttons),
    playstation: glyphs("playstation", buttons),
  }));
  padHost.pad.glyphStyle = "xbox";
  const guide = buildCodexGuide(CONFIG.trick.pts, CONFIG.trick.tiers, {
    jump: PAD.bindingLabel("jump"),
    dash: PAD.bindingLabel("dash"),
    throw: PAD.bindingLabel("throw"),
    tether: PAD.bindingLabel("tether"),
    pause: PAD.glyph(9),
  });

  // Preview-only content (Pale) must never reach the public wiki.
  const policy = JSON.parse(fs.readFileSync(path.join(root, "config", "campaign-publication-boundary.json"), "utf8"));
  const publishedVariants = new Set(variantModule.variantIdsAvailableOn("published"));
  const publishedBosses = new Set(director.BOSS_ROSTER.map((boss) => boss.id));
  const publishedEnemies = new Set(director.PUBLISHED_ENEMY_IDENTITY_IDS);
  const previewIds = [
    ...policy.previewStageIds,
    ...Object.values(variantModule.VARIANTS)
      .flat()
      .map((variant) => variant.id)
      .filter((id) => !publishedVariants.has(id)),
    ...(await load("/src/gameplay/run/boss-definitions.ts")).BOSS_IDENTITY_IDS.filter((id) => !publishedBosses.has(id)),
    ...Object.keys(bestiary.ENEMY_BESTIARY_COPY).filter((id) => !publishedEnemies.has(id)),
  ];
  const registry = JSON.parse(fs.readFileSync(path.join(root, "config", "terminology-registry.json"), "utf8"));
  // Modes reach the wiki only when the release surface admits them, by the game's own surface policy.
  const { createSurfaceAvailability } = await load("/src/domain/surface-availability.ts");
  const release = createSurfaceAvailability("release");
  const releaseModeIds = modeModule.MODE_CATALOG.filter((mode) => mode.enabled && release.admits(mode.surface)).map(
    (mode) => mode.id,
  );

  const data = wiki.buildWikiDataV1({
    reference,
    enemyIds: director.PUBLISHED_ENEMY_IDENTITY_IDS,
    enemyCopy: bestiary.ENEMY_BESTIARY_COPY,
    bossCopy: bestiary.BOSS_BESTIARY_COPY,
    bodies,
    affixes: affixModule.AFFIXES,
    elite: CONFIG.elite,
    status: CONFIG.status,
    colors: CONFIG.colors,
    dash: {
      speed: CONFIG.dash.speed,
      duration: CONFIG.dash.duration,
      cooldown: CONFIG.dash.cooldown,
      iframe: CONFIG.dash.iframe,
    },
    releaseModeIds,
    shopCategories: SHOP_CATEGORIES,
    shop,
    controls: {
      keyboard: guide.controls,
      gamepad,
      gamepadSticks: ["Left stick: move", "Right stick: swing the blade"],
    },
    style: {
      tricks: guide.tricks.map(({ name, points, description }) => ({ name, points, description })),
      ranks: CONFIG.trick.tiers
        .filter((tier) => tier.name)
        .map((tier) => ({ name: tier.name, gauge: tier.at, multiplier: tier.mult })),
      decaySeconds: CONFIG.trick.decay,
      hitLoss: CONFIG.trick.hitLoss,
      varietyMultiplier: CONFIG.trick.variety,
    },
    excludedNames: [
      ...new Set(
        registry.terms.flatMap((term) => [
          term.displayName,
          ...(term.deprecatedAliases ?? []),
          ...(term.deprecatedCopyAliases ?? []),
        ]),
      ),
    ],
    dirty,
    previewIds,
    catalog: {
      weapons: (await load("/src/gameplay/weapon-selection.ts")).WEAPON_IDS,
      upgrades: (await load("/src/gameplay/upgrades.ts")).UPGRADES.map((upgrade) => upgrade.id),
      enemies: director.ENEMY_IDENTITY_IDS,
      affixes: affixModule.AFFIXES.map((affix) => affix.id),
      bosses: (await load("/src/gameplay/run/boss-definitions.ts")).BOSS_IDENTITY_IDS,
      stages: (await load("/src/gameplay/stages.ts")).STAGE_IDS,
      modes: releaseModeIds,
      achievements: (await load("/src/gameplay/progression/achievement-catalog.ts")).CANONICAL_ACHIEVEMENT_IDS,
      shop: SHOP.map((item) => item.id),
    },
  });
  return wiki.encodeWikiDataV1(data);
}
