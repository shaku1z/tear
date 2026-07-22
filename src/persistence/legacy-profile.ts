import { migrateProfileEnvelope, mutableProfileWorkingCopy, type ProfileEnvelopeV2 } from "./profile-envelope";

interface SyncStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

interface AchievementDefinition {
  readonly id: string;
  readonly shards?: number;
  readonly coins?: number;
}

interface AchievementsPort {
  byId(id: string): AchievementDefinition | null | undefined;
  coinsFor(achievement: AchievementDefinition): number;
}

interface MetaPort {
  readonly data: Record<string, unknown>;
  addCoins(amount: number): void;
}

type Tracker = Record<string, unknown>;

export interface LegacyProfileData extends Record<string, unknown> {
  v: number;
  shards: number;
  ach: Record<string, number>;
  stats: Record<string, number | Tracker>;
  seen: Record<string, boolean>;
  modes: Record<string, boolean>;
  created: number;
  achCoinsRetrofit: boolean;
  username?: string;
  usernameSetAt?: number;
  pendingFinale?: Tracker;
  rewards?: Tracker;
  weaponsWon?: Record<string, number>;
  advDiffs?: Record<string, number>;
}

export interface LegacyProfile {
  readonly KEY: "tear_profile";
  readonly ENVELOPE_KEY: "tear_profile_v2";
  data: LegacyProfileData;
  load(): LegacyProfileData;
  save(): void;
  retrofitCoins(): void;
  username(): string;
  usernameSetAt(): number;
  setUsername(name: string): void;
  shards(): number;
  addShards(amount: number): void;
  stat(key: string): number;
  addStat(key: string, amount?: number): void;
  maxStat(key: string, value: number): void;
  markBiome(name: string): number;
  markMode(id: string): void;
  modesPlayed(): number;
  pendingFinale(): Tracker | null;
  setPendingFinale(payload?: object): void;
  clearPendingFinale(): void;
  unlocked(id: string): boolean;
  unlock(achievement: AchievementDefinition): boolean;
  unlockedCount(): number;
  merge(remote: unknown): void;
}

export interface LegacyProfileOptions {
  readonly store: SyncStore;
  readonly now?: () => number;
  readonly getAchievements: () => AchievementsPort | undefined;
  readonly getMeta: () => MetaPort | undefined;
  readonly writerId: () => string;
  readonly log?: (message: string) => void;
}

function record(value: unknown): Tracker | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Tracker : null;
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function boolMap(value: unknown): Record<string, boolean> {
  const source = record(value);
  const output: Record<string, boolean> = {};
  if (source) for (const [key, entry] of Object.entries(source)) if (entry) output[key] = true;
  return output;
}

function numberMap(value: unknown): Record<string, number> {
  const source = record(value);
  const output: Record<string, number> = {};
  if (source) for (const [key, entry] of Object.entries(source)) output[key] = finite(entry);
  return output;
}

export function createLegacyProfile(options: LegacyProfileOptions): LegacyProfile {
  const now = options.now ?? Date.now;
  let envelope: ProfileEnvelopeV2 | null = null;
  let envelopeWritable = true;
  const fresh = (): LegacyProfileData => ({
    v: 1, shards: 0, ach: {}, stats: {}, seen: {}, modes: {}, created: now(), achCoinsRetrofit: false,
  });

  const profile: LegacyProfile = {
    KEY: "tear_profile",
    ENVELOPE_KEY: "tear_profile_v2",
    data: fresh(),
    load() {
      let raw: Tracker | null = null;
      envelopeWritable = true;
      try {
        const text = options.store.get(this.ENVELOPE_KEY);
        if (text) {
          const migrated = migrateProfileEnvelope(JSON.parse(text) as unknown, now());
          if (migrated.ok) { envelope = migrated.value; raw = mutableProfileWorkingCopy(migrated.value); }
          else envelopeWritable = false;
        }
      } catch { envelope = null; envelopeWritable = false; }
      if (!raw) {
        let legacy: unknown;
        try { legacy = JSON.parse(options.store.get(this.KEY) ?? "{}") as unknown; } catch { legacy = {}; }
        const migrated = migrateProfileEnvelope(legacy, now());
        if (migrated.ok) { envelope = migrated.value; raw = mutableProfileWorkingCopy(migrated.value); }
      }
      const source = raw ?? {};
      this.data = Object.assign(fresh(), source, {
        ach: numberMap(source.ach),
        stats: record(source.stats) ?? {},
        seen: boolMap(source.seen),
        modes: boolMap(source.modes),
      });
      if (options.getAchievements() && options.getMeta()?.data && !this.data.achCoinsRetrofit) this.retrofitCoins();
      return this.data;
    },
    save() {
      try {
        const migrated = migrateProfileEnvelope({
          schema: "tear.profile", schemaVersion: 2, revision: (envelope?.revision ?? 0) + 1,
          updatedAtMs: now(), writerId: options.writerId(), profile: this.data,
          extensions: envelope?.extensions ?? {},
        }, now());
        if (migrated.ok && envelopeWritable) {
          envelope = migrated.value;
          options.store.set(this.ENVELOPE_KEY, JSON.stringify(migrated.value));
        }
        options.store.set(this.KEY, JSON.stringify(this.data));
      } catch { /* local memory state remains valid */ }
    },
    retrofitCoins() {
      const achievements = options.getAchievements();
      const meta = options.getMeta();
      if (!achievements || !meta) return;
      let total = 0;
      for (const id of Object.keys(this.data.ach)) {
        const achievement = achievements.byId(id);
        if (achievement) total += achievements.coinsFor(achievement);
      }
      if (total > 0) {
        meta.addCoins(total);
        this.addStat("coinsEarned", total);
        options.log?.(`[PROFILE] Retrofitted ${String(total)} coins for existing achievements.`);
      }
      this.data.achCoinsRetrofit = true;
      this.save();
    },
    username() { return typeof this.data.username === "string" ? this.data.username : ""; },
    usernameSetAt() { return finite(this.data.usernameSetAt); },
    setUsername(name) { this.data.username = name; this.data.usernameSetAt = now(); this.save(); },
    shards() { return finite(this.data.shards); },
    addShards(amount) { this.data.shards = finite(this.data.shards) + amount; this.save(); },
    stat(key) { return finite(this.data.stats[key]); },
    addStat(key, amount = 1) { this.data.stats[key] = finite(this.data.stats[key]) + amount; },
    maxStat(key, value) { if (value > finite(this.data.stats[key])) this.data.stats[key] = value; },
    markBiome(name) {
      const seen = record(this.data.stats._biomes) ?? {};
      seen[name] = 1;
      this.data.stats._biomes = seen;
      return Object.keys(seen).length;
    },
    markMode(id) {
      if (!this.data.modes[id]) { this.data.modes[id] = true; this.addStat("modesPlayed", 1); }
    },
    modesPlayed() { return Object.keys(this.data.modes).length; },
    pendingFinale() { return record(this.data.pendingFinale); },
    setPendingFinale(payload = {}) { this.data.pendingFinale = { savedAt: now(), ...payload }; this.save(); },
    clearPendingFinale() { delete this.data.pendingFinale; this.save(); },
    unlocked(id) { return this.data.ach[id] !== undefined; },
    unlock(achievement) {
      if (this.unlocked(achievement.id)) return false;
      this.data.ach[achievement.id] = now();
      this.data.shards += achievement.shards ?? 0;
      if (achievement.coins) { options.getMeta()?.addCoins(achievement.coins); this.addStat("coinsEarned", achievement.coins); }
      this.save();
      return true;
    },
    unlockedCount() { return Object.keys(this.data.ach).length; },
    merge(remote) {
      const source = record(remote);
      if (!source) return;
      this.data.shards = Math.max(this.data.shards, finite(source.shards));
      const remoteStats = record(source.stats);
      if (remoteStats) for (const [key, value] of Object.entries(remoteStats)) {
        if (key.startsWith("_") && record(value)) {
          this.data.stats[key] = { ...(record(this.data.stats[key]) ?? {}), ...record(value) };
        } else this.data.stats[key] = Math.max(finite(this.data.stats[key]), finite(value));
      }
      const remoteAchievements = numberMap(source.ach);
      for (const [id, timestamp] of Object.entries(remoteAchievements)) {
        const local = this.data.ach[id];
        if (local === undefined || timestamp < local) this.data.ach[id] = timestamp;
      }
      if (typeof source.username === "string" && finite(source.usernameSetAt) > this.usernameSetAt()) {
        this.data.username = source.username;
        this.data.usernameSetAt = finite(source.usernameSetAt);
      }
      Object.assign(this.data.modes, boolMap(source.modes));
      Object.assign(this.data.seen, boolMap(source.seen));
      const rewards = record(source.rewards);
      if (rewards) this.data.rewards = { ...(this.data.rewards ?? {}), ...rewards };
      const remoteFinale = record(source.pendingFinale);
      if (remoteFinale && (!this.data.pendingFinale || finite(remoteFinale.savedAt) > finite(this.data.pendingFinale.savedAt))) {
        this.data.pendingFinale = remoteFinale;
      }
      const mergeSet = (key: "weaponsWon" | "advDiffs") => {
        const incoming = numberMap(source[key]);
        if (Object.keys(incoming).length === 0) return;
        const target = this.data[key] ?? {};
        for (const id of Object.keys(incoming)) target[id] = 1;
        this.data[key] = target;
      };
      mergeSet("weaponsWon");
      mergeSet("advDiffs");
      this.data.stats.biomesSeen = Math.max(finite(this.data.stats.biomesSeen), Object.keys(record(this.data.stats._biomes) ?? {}).length);
      this.data.stats.modesPlayed = Math.max(finite(this.data.stats.modesPlayed), Object.keys(this.data.modes).length);
      if (this.data.weaponsWon) this.data.stats.distinctWeaponsWon = Math.max(finite(this.data.stats.distinctWeaponsWon), Object.keys(this.data.weaponsWon).length);
      if (this.data.advDiffs) this.data.stats.clearAdvAll = Math.max(finite(this.data.stats.clearAdvAll), Object.keys(this.data.advDiffs).length);
    },
  };
  return profile;
}
