export interface MetaStorePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface MetaCloudPort {
  loggedIn(): boolean;
  push(): Promise<void>;
}

export interface ProgressionRandomPort { next(): number }

export interface ProgressionConfigPort {
  readonly blade: {
    damageScale: number; maxDamage: number; aimRadius: number; length: number; maxReach: number;
    readonly throw: { damage: number; damageFromSpeed: number };
  };
  readonly player: { moveSpeed: number; dmgTakenMult: number };
  readonly dash: { cooldown: number };
}

export interface ProgressionPlayer {
  maxHp: number; hp: number; maxShield: number; shield: number; maxDashCharges: number; dashCharges: number;
  shopRevives: number; dashMomentumMult: number; airborneDmgMult: number; secondBreathDuration: number;
  hazardDmgMult: number;
}

export interface ProgressionBlade { throwCooldownMult: number; recallWindow: number }

export interface ProgressionMods {
  waveHeal: number; reservePick: boolean; draftRerolls: number; expandedDraft: boolean;
}

export interface ProgressionApplyContext {
  readonly player: ProgressionPlayer;
  readonly blade: ProgressionBlade;
  readonly mods: ProgressionMods;
  readonly [key: string]: unknown;
}

export interface UpgradeDefinition { readonly unique?: boolean }

export type ShopCategory = "vit" | "blade" | "tempo" | "fortune";

export interface ShopItem<ApplyContext extends ProgressionApplyContext = ProgressionApplyContext> {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly maxLevel: number;
  readonly cat: ShopCategory;
  readonly glyph: string;
  readonly baseCost?: number;
  readonly costs?: readonly number[];
  now(level: number): string;
  apply(level: number, context: ApplyContext): void;
}

export interface MetaData {
  readonly [key: string]: unknown;
  lifetimeEarned: number;
  lifetimeSpent: number;
  buy: Record<string, number>;
}

export interface MetaProgression<ApplyContext extends ProgressionApplyContext = ProgressionApplyContext> {
  data: MetaData;
  load(): MetaData;
  save(): void;
  coins(): number;
  level(id: string): number;
  addCoins(amount: number): void;
  cost(item: ShopItem<ApplyContext>): number;
  canBuy(item: ShopItem<ApplyContext>): boolean;
  buy(item: ShopItem<ApplyContext>): boolean;
  apply(context: ApplyContext): void;
  merge(remote: unknown): void;
}

export interface MetaProgressionDependencies<
  Upgrade extends UpgradeDefinition = UpgradeDefinition,
  ApplyContext extends ProgressionApplyContext = ProgressionApplyContext,
> {
  readonly store: MetaStorePort;
  readonly config: ProgressionConfigPort;
  readonly cloud: MetaCloudPort;
  readonly random: ProgressionRandomPort;
  readonly upgrades: readonly Upgrade[];
  readonly applyUpgrade: (upgrade: Upgrade, context: ApplyContext) => void;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function migrateMetaData(value: unknown): MetaData {
  const source = record(value) ?? {};
  const legacyCoins = source.lifetimeEarned === undefined ? amount(source.coins) : 0;
  const purchases: Record<string, number> = {};
  const rawPurchases = record(source.buy);
  if (rawPurchases) {
    for (const [id, level] of Object.entries(rawPurchases)) purchases[id] = Math.floor(amount(level));
  }
  return {
    lifetimeEarned: source.lifetimeEarned === undefined ? legacyCoins : amount(source.lifetimeEarned),
    lifetimeSpent: source.lifetimeEarned === undefined ? 0 : amount(source.lifetimeSpent),
    buy: purchases,
  };
}

export function createMetaProgression<Upgrade extends UpgradeDefinition, ApplyContext extends ProgressionApplyContext>(
  dependencies: MetaProgressionDependencies<Upgrade, ApplyContext>,
): Readonly<{ META: MetaProgression<ApplyContext>; SHOP: readonly ShopItem<ApplyContext>[] }> {
  const { config, random } = dependencies;
  let shop: readonly ShopItem<ApplyContext>[] = [];
  const meta: MetaProgression<ApplyContext> = {
    data: migrateMetaData({}),
    load() {
      let parsed: unknown;
      try { parsed = JSON.parse(dependencies.store.get("tear_meta") ?? "{}"); } catch { parsed = {}; }
      const migrated = migrateMetaData(parsed);
      this.data = migrated;
      const source = record(parsed);
      if (source?.coins !== undefined && source.lifetimeEarned === undefined) this.save();
      return this.data;
    },
    save() { try { dependencies.store.set("tear_meta", JSON.stringify(this.data)); } catch { /* offline memory remains authoritative */ } },
    coins() { return Math.max(0, this.data.lifetimeEarned - this.data.lifetimeSpent); },
    level(id) { return this.data.buy[id] ?? 0; },
    addCoins(value) { this.data.lifetimeEarned += amount(value); this.save(); },
    cost(item) {
      const level = this.level(item.id);
      if (item.costs) return item.costs[Math.min(level, item.costs.length - 1)] ?? 0;
      const base = item.baseCost ?? 0;
      return Math.round(base * (1 + 0.28 * level + 0.09 * level * level) / 25) * 25;
    },
    canBuy(item) { return this.level(item.id) < item.maxLevel && this.coins() >= this.cost(item); },
    buy(item) {
      if (!this.canBuy(item)) return false;
      this.data.lifetimeSpent += this.cost(item);
      this.data.buy[item.id] = this.level(item.id) + 1;
      this.save();
      if (dependencies.cloud.loggedIn()) void dependencies.cloud.push();
      return true;
    },
    apply(context) { for (const item of shop) { const level = this.level(item.id); if (level > 0) item.apply(level, context); } },
    merge(remote) {
      const incoming = migrateMetaData(remote);
      this.data.lifetimeEarned = Math.max(this.data.lifetimeEarned, incoming.lifetimeEarned);
      this.data.lifetimeSpent = Math.max(this.data.lifetimeSpent, incoming.lifetimeSpent);
      for (const [id, level] of Object.entries(incoming.buy)) this.data.buy[id] = Math.max(this.level(id), level);
    },
  };

  shop = [
    { id: "tough", name: "Toughness", desc: "+12 starting max HP per level.", baseCost: 325, maxLevel: 8, cat: "vit", glyph: "❤",
      now: (level) => `+${String(12 * level)} HP`, apply: (level, { player }) => { player.maxHp += 12 * level; player.hp = player.maxHp; } },
    { id: "sharp", name: "Sharpness", desc: "+6% damage per level.", baseCost: 375, maxLevel: 8, cat: "blade", glyph: "⚔",
      now: (level) => `+${String(Math.round((1.06 ** level - 1) * 100))}% dmg`, apply: (level) => { config.blade.damageScale *= 1.06 ** level; config.blade.maxDamage = Math.round(config.blade.maxDamage * 1.05 ** level); } },
    { id: "swift", name: "Swiftness", desc: "+4% move speed per level.", baseCost: 350, maxLevel: 6, cat: "tempo", glyph: "≫",
      now: (level) => `+${String(Math.round((1.04 ** level - 1) * 100))}% speed`, apply: (level) => { config.player.moveSpeed *= 1.04 ** level; } },
    { id: "recovery", name: "Conditioning", desc: "-6% dash cooldown per level.", baseCost: 375, maxLevel: 6, cat: "tempo", glyph: "↯",
      now: (level) => `−${String(Math.round((1 - 0.94 ** level) * 100))}% dash cd`, apply: (level) => { config.dash.cooldown *= 0.94 ** level; } },
    { id: "headstart", name: "Head Start", desc: "Begin each run with a random upgrade.", baseCost: 3000, maxLevel: 1, cat: "fortune", glyph: "✦",
      now: () => "1 free upgrade", apply: (_level, context) => { const pool = dependencies.upgrades.filter((upgrade) => !upgrade.unique); const upgrade = pool[Math.floor(random.next() * pool.length)]; if (upgrade) dependencies.applyUpgrade(upgrade, context); } },
    { id: "greed", name: "Coin Magnet", desc: "+8% score-derived coins per level.", baseCost: 650, maxLevel: 5, cat: "fortune", glyph: "◆",
      now: (level) => `+${String(8 * level)}% score coins`, apply: () => { return; } },
    { id: "reach", name: "Long Arm", desc: "+ blade reach & length per level.", baseCost: 425, maxLevel: 5, cat: "blade", glyph: "↔",
      now: (level) => `+${String(12 * level)} reach`, apply: (level) => { config.blade.aimRadius += 12 * level; config.blade.length += 6 * level; config.blade.maxReach += 12 * level; } },
    { id: "throwarm", name: "Throwing Arm", desc: "+8% thrown-blade damage per level.", baseCost: 400, maxLevel: 6, cat: "blade", glyph: "➹",
      now: (level) => `+${String(Math.round((1.08 ** level - 1) * 100))}% throw dmg`, apply: (level) => { config.blade.throw.damage *= 1.08 ** level; config.blade.throw.damageFromSpeed *= 1.08 ** level; } },
    { id: "thickskin", name: "Thick Skin", desc: "Take -4% damage per level.", baseCost: 475, maxLevel: 6, cat: "vit", glyph: "▣",
      now: (level) => `−${String(Math.round((1 - 0.96 ** level) * 100))}% dmg taken`, apply: (level) => { config.player.dmgTakenMult *= 0.96 ** level; } },
    { id: "warding", name: "Warding", desc: "Begin each run with a one-hit shield per level.", baseCost: 1100, maxLevel: 2, cat: "fortune", glyph: "⬡",
      now: (level) => `${String(level)} shield${level > 1 ? "s" : ""}`, apply: (level, { player }) => { player.maxShield = Math.max(player.maxShield, level); player.shield = player.maxShield; } },
    { id: "aircharge", name: "Aether Step", desc: "Start with an extra mid-air dash charge.", baseCost: 3500, maxLevel: 1, cat: "tempo", glyph: "⇈",
      now: () => "+1 air dash", apply: (level, { player }) => { player.maxDashCharges += level; player.dashCharges = player.maxDashCharges; } },
    { id: "lifeline", name: "Lifeline", desc: "Recover +5 HP on each wave clear per level.", baseCost: 550, maxLevel: 4, cat: "vit", glyph: "✚",
      now: (level) => `+${String(5 * level)} HP / wave`, apply: (level, { mods }) => { mods.waveHeal += 5 * level; } },
    { id: "phoenix", name: "Second Wind", desc: "Once per run, revive with 35% HP when you would fall.", baseCost: 6000, maxLevel: 1, cat: "vit", glyph: "❁",
      now: () => "1 revive", apply: (level, { player }) => { player.shopRevives += level; } },
    { id: "momentum", name: "Momentum Transfer", desc: "Retain 6% more horizontal momentum after a dash per level.", baseCost: 450, maxLevel: 5, cat: "tempo", glyph: "↠",
      now: (level) => `+${String(Math.round((1.06 ** level - 1) * 100))}% dash carry`, apply: (level, { player }) => { player.dashMomentumMult *= 1.06 ** level; } },
    { id: "aerialbracing", name: "Aerial Bracing", desc: "Take 3% less damage while airborne per level.", baseCost: 500, maxLevel: 5, cat: "vit", glyph: "△",
      now: (level) => `−${String(Math.round((1 - 0.97 ** level) * 100))}% air damage`, apply: (level, { player }) => { player.airborneDmgMult *= 0.97 ** level; } },
    { id: "slinggrip", name: "Sling Grip", desc: "Thrown-blade release recovery is 4% shorter per level.", baseCost: 500, maxLevel: 5, cat: "blade", glyph: "➶",
      now: (level) => `−${String(Math.round((1 - 0.96 ** level) * 100))}% release recovery`, apply: (level, { blade }) => { blade.throwCooldownMult *= 0.96 ** level; } },
    { id: "recallwindow", name: "Recall Window", desc: "Recall a distant blade 0.10s earlier per level.", baseCost: 550, maxLevel: 4, cat: "blade", glyph: "↶",
      now: (level) => `${(0.1 * level).toFixed(2)}s early recall`, apply: (level, { blade }) => { blade.recallWindow += 0.1 * level; } },
    { id: "hazardboots", name: "Hazard Boots", desc: "Take 6% less floor and environmental hazard damage per level.", baseCost: 450, maxLevel: 5, cat: "vit", glyph: "▱",
      now: (level) => `−${String(Math.round((1 - 0.94 ** level) * 100))}% hazard damage`, apply: (level, { player }) => { player.hazardDmgMult *= 0.94 ** level; } },
    { id: "secondbreath", name: "Second Breath", desc: "Once per stage below 30% HP, regenerate 1.25% max HP/s for 4s per level.", baseCost: 750, maxLevel: 4, cat: "vit", glyph: "♨",
      now: (level) => `${String(5 * level)}% HP over ${String(4 * level)}s`, apply: (level, { player }) => { player.secondBreathDuration = 4 * level; } },
    { id: "reserve", name: "Reserve Pick", desc: "Reserve one unchosen card for your next normal draft.", baseCost: 6500, maxLevel: 1, cat: "fortune", glyph: "▣",
      now: () => "1 reserved draft card", apply: (level, { mods }) => { mods.reservePick = level > 0; } },
    { id: "reroll", name: "Reroll", desc: "Gain one normal-draft reroll charge per level, shared across the run.", costs: [3000, 5500, 9000], maxLevel: 3, cat: "fortune", glyph: "⟳",
      now: (level) => `${String(level)} reroll${level === 1 ? "" : "s"} / run`, apply: (level, { mods }) => { mods.draftRerolls += level; } },
    { id: "expanded", name: "Expanded Draft", desc: "Normal drafts offer four cards instead of three.", baseCost: 10000, maxLevel: 1, cat: "fortune", glyph: "▥",
      now: () => "4-card normal drafts", apply: (level, { mods }) => { mods.expandedDraft = level > 0; } },
  ];

  return Object.freeze({ META: meta, SHOP: shop });
}
