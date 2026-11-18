import {
  conditionMet,
  conditionProgress,
  type ProgressFacts,
  type UnlockCondition,
} from "../../domain/unlock-condition";
import { ACHIEVEMENT_CATALOG, CANONICAL_ACHIEVEMENT_IDS } from "./achievement-catalog";

export type AchievementRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type AchievementCategory = "combat" | "skill" | "progress" | "boss" | "survival" | "mastery";

export interface AchievementProfilePort {
  unlocked(id: string): boolean;
  stat(key: string): number;
  /** What the shared condition language can ask of the profile. */
  facts(): ProgressFacts;
  unlock(achievement: Achievement): boolean;
}

export interface Achievement {
  id: string;
  cat: AchievementCategory;
  rarity: AchievementRarity;
  name: string;
  desc: string;
  /** The requirement, in the shared condition language. Most achievements are a stat reaching a goal. */
  condition?: UnlockCondition;
  /** Counted progress for requirements that are not profile facts (shop items maxed). */
  goal?: (profile: AchievementProfilePort) => number;
  current?: (profile: AchievementProfilePort) => number;
  check?: (profile: AchievementProfilePort) => boolean;
  hidden?: boolean;
  manual?: boolean;
  master?: boolean;
  shards?: number;
  coins?: number;
}

export interface AchievementShopPort {
  readonly id: string;
  readonly maxLevel: number;
}
export interface AchievementMetaPort {
  level(id: string): number;
}
export interface AchievementAudioPort {
  rankup(): void;
}

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
  _all: Achievement[];
  readonly list: Achievement[];
  _build(): void;
  byId(id: string): Achievement | undefined;
  shardsFor(achievement: Achievement): number;
  coinsFor(achievement: Achievement): number;
  totalShards(): number;
  measure(achievement: Achievement, facts: ProgressFacts): Readonly<{ current: number; goal: number }>;
  isMet(achievement: Achievement, facts: ProgressFacts): boolean;
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
      common: { name: "COMMON", color: "#8a93a6", shards: 5, coins: 75 },
      uncommon: { name: "UNCOMMON", color: "#2f9e6b", shards: 12, coins: 200 },
      rare: { name: "RARE", color: "#2f7bd6", shards: 25, coins: 450 },
      epic: { name: "EPIC", color: "#9b53d6", shards: 50, coins: 900 },
      legendary: { name: "LEGENDARY", color: "#e0a326", shards: 100, coins: 2000 },
    },
    CATS: {
      combat: { name: "Combat", color: "#e23b3b", icon: "⚔" },
      skill: { name: "Skill", color: "#13c4d6", icon: "✦" },
      progress: { name: "Progression", color: "#e0a326", icon: "▲" },
      boss: { name: "Bosses", color: "#9b53d6", icon: "☠" },
      survival: { name: "Survival", color: "#2f9e6b", icon: "❤" },
      mastery: { name: "Mastery", color: "#c9ccd6", icon: "◆" },
    },

    _all: [], // canonical list; includes locked hidden achievements for mastery logic
    get list() {
      return this._all.filter((a) => !a.hidden || PROFILE.unlocked(a.id));
    },
    _build() {
      this._all = ACHIEVEMENT_CATALOG.map((entry) => {
        const achievement: Achievement = {
          id: entry.id,
          cat: entry.cat,
          rarity: entry.rarity,
          name: entry.name,
          desc: entry.desc,
        };
        if (entry.hidden) achievement.hidden = true;
        if (entry.manual) achievement.manual = true;
        if (entry.master) achievement.master = true;
        switch (entry.rule.kind) {
          case "stat-threshold":
            achievement.condition = { type: "stat-threshold", stat: entry.rule.stat, goal: entry.rule.goal };
            break;
          case "manual":
            break;
          case "all-shop-items":
            achievement.current = () =>
              typeof SHOP === "undefined" ? 0 : SHOP.filter((s) => META.level(s.id) >= s.maxLevel).length;
            achievement.goal = () => (typeof SHOP === "undefined" ? 1 : SHOP.length);
            break;
          case "category-complete":
            {
              const category = entry.rule.category;
              achievement.check = () =>
                this._all
                  .filter((a) => a.cat === category && a.id !== entry.id && !a.master)
                  .every((a) => PROFILE.unlocked(a.id));
            }
            break;
          case "all-achievements":
            achievement.check = () => this._all.filter((a) => a.id !== entry.id).every((a) => PROFILE.unlocked(a.id));
            break;
        }
        return achievement;
      });
    },

    byId(id) {
      return this._all.find((a) => a.id === id);
    },
    shardsFor(a) {
      return a.shards ?? this.RARITY[a.rarity].shards;
    },
    coinsFor(a) {
      return a.coins ?? this.RARITY[a.rarity].coins;
    },
    totalShards() {
      let s = 0;
      for (const a of this.list) s += this.shardsFor(a);
      return s;
    },

    // How far along an achievement is, as counts. A condition is measured by the shared language.
    measure(a, facts) {
      if (a.condition) return conditionProgress(a.condition, facts);
      if (a.current && a.goal) return { current: a.current(PROFILE), goal: a.goal(PROFILE) };
      return { current: a.check?.(PROFILE) === true ? 1 : 0, goal: 1 };
    },
    // 0..1 progress toward an achievement (for the menu's bars)
    progress(a) {
      if (PROFILE.unlocked(a.id)) return 1;
      if (a.manual) return 0;
      const { current, goal } = this.measure(a, PROFILE.facts());
      return clamp(current / goal, 0, 1);
    },
    progressText(a) {
      if (a.check || (!a.condition && !a.goal)) return PROFILE.unlocked(a.id) ? "Complete" : "Locked";
      const { current, goal } = this.measure(a, PROFILE.facts());
      return `${String(Math.min(current, goal))} / ${String(goal)}`;
    },

    pending: [], // freshly unlocked -> the HUD/menu toast queue

    isMet(a, facts) {
      if (a.condition) return conditionMet(a.condition, facts);
      if (a.check) return a.check(PROFILE);
      const { current, goal } = this.measure(a, facts);
      return current >= goal;
    },

    // evaluate every locked achievement; unlock + reward + queue toasts for newly-met ones
    check() {
      const facts = PROFILE.facts();
      for (const a of this._all) {
        if (PROFILE.unlocked(a.id)) continue;
        if (a.manual) continue; // scripted/choice achievements unlock only at their authored event
        if (this.isMet(a, facts)) {
          a.shards = this.shardsFor(a);
          a.coins = this.coinsFor(a);
          if (PROFILE.unlock(a)) {
            this.pending.push(a);
            try {
              SFX.rankup();
            } catch {
              /* Reward state remains authoritative if audio is unavailable. */
            }
          }
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
      try {
        SFX.rankup();
      } catch {
        /* Reward state remains authoritative if audio is unavailable. */
      }
      return true;
    },
  };
  ACH._build();

  return ACH;
}

export { ACHIEVEMENT_CATALOG, CANONICAL_ACHIEVEMENT_IDS, createAchievements };
