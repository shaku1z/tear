import { ACHIEVEMENT_CATALOG, CANONICAL_ACHIEVEMENT_IDS } from "./achievement-catalog";

export type AchievementRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type AchievementCategory = "combat" | "skill" | "progress" | "boss" | "survival" | "mastery";

export interface AchievementProfilePort {
  unlocked(id: string): boolean;
  stat(key: string): number;
  unlock(achievement: Achievement): boolean;
}

export interface Achievement {
  id: string;
  cat: AchievementCategory;
  rarity: AchievementRarity;
  name: string;
  desc: string;
  stat?: string;
  goal?: number | ((profile: AchievementProfilePort) => number);
  current?: (profile: AchievementProfilePort) => number;
  check?: (profile: AchievementProfilePort) => boolean;
  hidden?: boolean;
  manual?: boolean;
  master?: boolean;
  shards?: number;
  coins?: number;
}

export interface AchievementShopPort { readonly id: string; readonly maxLevel: number }
export interface AchievementMetaPort { level(id: string): number }
export interface AchievementAudioPort { rankup(): void }

export interface AchievementDependencies {
  readonly meta: AchievementMetaPort;
  readonly profile: AchievementProfilePort;
  readonly audio: AchievementAudioPort;
  readonly shop: readonly AchievementShopPort[];
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
}

export interface AchievementSystem {
  readonly RARITY: Record<AchievementRarity, Readonly<{ name: string; color: string; shards: number; coins: number }>>;
  readonly CATS: Record<AchievementCategory, Readonly<{ name: string; color: string; icon: string }>>;
  _s(id: string, cat: AchievementCategory, rarity: AchievementRarity, name: string, desc: string, stat?: string, goal?: number): Achievement;
  _all: Achievement[];
  readonly list: Achievement[];
  _build(): void;
  byId(id: string): Achievement | undefined;
  shardsFor(achievement: Achievement): number;
  coinsFor(achievement: Achievement): number;
  totalShards(): number;
  progress(achievement: Achievement): number;
  progressText(achievement: Achievement): string;
  pending: Achievement[];
  check(): void;
  unlock(id: string): boolean;
}

// ------- achievements: data-driven feats that grant Shards -------
// Each achievement watches a lifetime stat in PROFILE (or a custom check). ACH.check()
// runs after gameplay events, unlocks any newly-met feats, grants their Shards, and
// queues a toast. Most are `stat >= goal`; `check(P)` allows anything bespoke.
// Rarity sets the Shard payout; the Achievements menu (Phase 2) reads these too.
function createAchievements(dependencies: AchievementDependencies): AchievementSystem {
  const { meta: META, profile: PROFILE, audio: SFX, shop: SHOP, clamp } = dependencies;

const ACH: AchievementSystem = {
  RARITY: {
    common:    { name: "COMMON",    color: "#8a93a6", shards: 5, coins: 75 },
    uncommon:  { name: "UNCOMMON",  color: "#2f9e6b", shards: 12, coins: 200 },
    rare:      { name: "RARE",      color: "#2f7bd6", shards: 25, coins: 450 },
    epic:      { name: "EPIC",      color: "#9b53d6", shards: 50, coins: 900 },
    legendary: { name: "LEGENDARY", color: "#e0a326", shards: 100, coins: 2000 },
  },
  CATS: {
    combat:   { name: "Combat",      color: "#e23b3b", icon: "⚔" },
    skill:    { name: "Skill",       color: "#13c4d6", icon: "✦" },
    progress: { name: "Progression", color: "#e0a326", icon: "▲" },
    boss:     { name: "Bosses",      color: "#9b53d6", icon: "☠" },
    survival: { name: "Survival",    color: "#2f9e6b", icon: "❤" },
    mastery:  { name: "Mastery",     color: "#c9ccd6", icon: "◆" },
  },

  // goal helper: a stat-threshold achievement (the common case)
  _s(id, cat, rarity, name, desc, stat, goal) {
    return {
      id, cat, rarity, name, desc,
      ...(stat === undefined ? {} : { stat }),
      ...(goal === undefined ? {} : { goal }),
    };
  },

  _all: [],   // canonical list; includes locked hidden achievements for mastery logic
  get list() {
    return this._all.filter((a) => !a.hidden || PROFILE.unlocked(a.id));
  },
  _build() {
    this._all = ACHIEVEMENT_CATALOG.map((entry) => {
      const achievement: Achievement = {
        id: entry.id, cat: entry.cat, rarity: entry.rarity, name: entry.name, desc: entry.desc,
      };
      if (entry.hidden) achievement.hidden = true;
      if (entry.manual) achievement.manual = true;
      if (entry.master) achievement.master = true;
      switch (entry.rule.kind) {
        case "stat-threshold":
          achievement.stat = entry.rule.stat;
          achievement.goal = entry.rule.goal;
          break;
        case "manual":
          break;
        case "all-shop-items":
          achievement.current = () => typeof SHOP === "undefined" ? 0 : SHOP.filter((s) => META.level(s.id) >= s.maxLevel).length;
          achievement.goal = () => typeof SHOP === "undefined" ? 1 : SHOP.length;
          break;
        case "category-complete":
          {
            const category = entry.rule.category;
            achievement.check = () => this._all.filter((a) => a.cat === category && a.id !== entry.id && !a.master).every((a) => PROFILE.unlocked(a.id));
          }
          break;
        case "all-achievements":
          achievement.check = () => this._all.filter((a) => a.id !== entry.id).every((a) => PROFILE.unlocked(a.id));
          break;
      }
      return achievement;
    });
  },

  byId(id) { return this._all.find((a) => a.id === id); },
  shardsFor(a) { return a.shards ?? this.RARITY[a.rarity].shards; },
  coinsFor(a) { return a.coins ?? this.RARITY[a.rarity].coins; },
  totalShards() { let s = 0; for (const a of this.list) s += this.shardsFor(a); return s; },

  // 0..1 progress toward an achievement (for the menu's bars)
  progress(a) {
    if (PROFILE.unlocked(a.id)) return 1;
    if (a.manual) return 0;
    if (a.check) return a.check(PROFILE) ? 1 : 0;
    const cur = a.current ? a.current(PROFILE) : PROFILE.stat(a.stat ?? "");
    const goal = (typeof a.goal === "function" ? a.goal(PROFILE) : a.goal) ?? 1;
    return clamp(cur / goal, 0, 1);
  },
  progressText(a) {
    if (a.check || !a.goal) return PROFILE.unlocked(a.id) ? "Complete" : "Locked";
    const goal = typeof a.goal === "function" ? a.goal(PROFILE) : a.goal;
    const cur = Math.min(a.current ? a.current(PROFILE) : PROFILE.stat(a.stat ?? ""), goal);
    return `${String(cur)} / ${String(goal)}`;
  },

  pending: [],   // freshly unlocked -> the HUD/menu toast queue

  // evaluate every locked achievement; unlock + reward + queue toasts for newly-met ones
  check() {
    for (const a of this._all) {
      if (PROFILE.unlocked(a.id)) continue;
      if (a.manual) continue;   // scripted/choice achievements unlock only at their authored event
      const goal = (typeof a.goal === "function" ? a.goal(PROFILE) : a.goal) ?? 1;
      const current = a.current ? a.current(PROFILE) : PROFILE.stat(a.stat ?? "");
      const met = a.check ? a.check(PROFILE) : current >= goal;
      if (met) {
        a.shards = this.shardsFor(a);
        a.coins = this.coinsFor(a);
        if (PROFILE.unlock(a)) { this.pending.push(a); try { SFX.rankup(); } catch { /* Reward state remains authoritative if audio is unavailable. */ } }
      }
    }
  },

  // Scripted achievements use the same reward/toast path as check(), without needing a
  // throwaway PROFILE stat. This keeps direct choice unlocks safe and idempotent.
  unlock(id) {
    const a = this.byId(id);
    if (!a || PROFILE.unlocked(id)) return false;
    a.shards = this.shardsFor(a);
    a.coins = this.coinsFor(a);
    if (!PROFILE.unlock(a)) return false;
    this.pending.push(a);
    try { SFX.rankup(); } catch { /* Reward state remains authoritative if audio is unavailable. */ }
    return true;
  },
};
ACH._build();

  return ACH;
}

export { ACHIEVEMENT_CATALOG, CANONICAL_ACHIEVEMENT_IDS, createAchievements };
