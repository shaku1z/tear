import type { CosmeticCatalog, CosmeticState } from "../domain/cosmetic-types";
import {
  claimableGrants,
  equipCosmetic,
  grantItems,
  markSeen,
  mergeCosmeticStates,
  normalizeCosmeticState,
  purchaseCosmetic,
  shardBalance,
  type PurchaseRefusal,
} from "../domain/cosmetics";
import {
  betterGauntletClear,
  mergeGauntletBests,
  normalizeGauntletBests,
  type GauntletClear,
} from "../domain/gauntlet-records";
import { progressFacts } from "../domain/progress-facts";
import { asRecord, finiteOrZero, hasOwnKey, ownValue, safeEntries } from "../domain/records";
import type { ProgressFacts } from "../domain/unlock-condition";
import type { AcknowledgedStorage } from "../platform/contracts";
import {
  achievementOutbox,
  addGrant,
  isTutorialCourseId,
  mergeAchievementOutboxes,
  mergeTutorialLedgers,
  outboxCoins,
  outboxShards,
  receiptOpen,
  tutorialCount,
  tutorialLedger,
  type AchievementGrant,
  type CompletionStatus,
} from "../domain/reward-receipts";
import {
  PROFILE_ENVELOPE_VERSION,
  migrateProfileEnvelope,
  mutableProfileWorkingCopy,
  type ProfileEnvelopeV2,
} from "./profile-envelope";
import {
  freshProfile,
  PROFILE_ENVELOPE_KEY,
  PROFILE_MIRROR_KEY,
  readStoredProfile,
  type ProfileData,
  type Tracker,
} from "./saved-profile";
import type { SaveProblemReporter } from "../domain/save-problems";

interface SyncStore {
  readonly acknowledged?: AcknowledgedStorage;
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
  shardsFor?(achievement: AchievementDefinition): number;
}

interface MetaPort {
  readonly data: Record<string, unknown>;
  addCoins(amount: number): void;
}

export type { ProfileData };

export interface ProfileStore {
  readonly KEY: typeof PROFILE_MIRROR_KEY;
  readonly ENVELOPE_KEY: typeof PROFILE_ENVELOPE_KEY;
  data: ProfileData;
  load(): ProfileData;
  flushAcknowledged(): Promise<CompletionStatus>;
  issueTutorial(id: string): Promise<CompletionStatus>;
  completeTutorial(id: string): Promise<CompletionStatus>;
  acknowledgeReward(id: string): Promise<CompletionStatus>;
  pendingRewards(): readonly Readonly<{ id: string; coins: number }>[];
  save(): void;
  retrofitCoins(): void;
  username(): string;
  usernameSetAt(): number;
  setUsername(name: string): void;
  shards(): number;
  /** Pays `shards` once for this receipt (a daily claim); false when it was paid already or its day is closed. */
  claimShards(receiptId: string, shards: number): boolean;
  /** Whether claiming this receipt would still pay. */
  shardsClaimable(receiptId: string): boolean;
  /** Validated cosmetic ownership and equipped slots. */
  cosmetics(): CosmeticState;
  /** The fastest Gauntlet clear on this difficulty, or null before the first. */
  gauntletBest(difficulty: string): GauntletClear | null;
  /** Keeps a Gauntlet clear when it beats the best on its difficulty; true when it does. */
  recordGauntletClear(difficulty: string, clear: GauntletClear): boolean;
  /** Shards left to spend: earned minus the prices paid for owned cosmetics, never below zero. */
  shardBalance(): number;
  buyCosmetic(itemId: string): Promise<CompletionStatus | PurchaseRefusal>;
  /** `null` clears the slot back to the default look. */
  equipCosmetic(slot: string, itemId: string | null): Promise<CompletionStatus | "unknown">;
  /** Grants items earned without paying (an achievement, a defeated boss, a finished collection). */
  claimCosmeticGrants(): Promise<CompletionStatus>;
  /** Records that the player has seen these items, which clears their "new" badge. */
  markCosmeticsSeen(itemIds: readonly string[]): Promise<CompletionStatus>;
  stat(key: string): number;
  /** What the condition language can ask of this profile, read live. */
  facts(): ProgressFacts;
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

export interface ProfileStoreOptions {
  readonly store: SyncStore;
  readonly now?: () => number;
  readonly getAchievements: () => AchievementsPort | undefined;
  readonly getMeta: () => MetaPort | undefined;
  readonly writerId: () => string;
  readonly onCommitted?: () => void;
  readonly onLoaded?: () => void;
  /** Told when the stored profile cannot be used, so the player can be told. */
  readonly reportProblem?: SaveProblemReporter;
  readonly log?: (message: string) => void;
  /** Published biome display names whose discovery counts toward progression. */
  readonly countedBiomeNames?: readonly string[];
  /** The cosmetic rows; without it every cosmetic action reports "unknown". */
  readonly getCosmeticCatalog?: () => CosmeticCatalog | undefined;
}

function record(value: unknown): Tracker | null {
  return asRecord(value) ?? null;
}

function boolMap(value: unknown): Record<string, boolean> {
  const source = record(value);
  const output: Record<string, boolean> = {};
  if (source) for (const [key, entry] of safeEntries(source)) if (entry) output[key] = true;
  return output;
}

function numberMap(value: unknown): Record<string, number> {
  const source = record(value);
  const output: Record<string, number> = {};
  if (source) for (const [key, entry] of safeEntries(source)) output[key] = finiteOrZero(entry);
  return output;
}

const RECEIPT_OWNED_FIELDS = new Set([
  "tutorialCompletion",
  "achievementOutbox",
  "ach",
  "stats",
  "shards",
  "seen",
  "modes",
  "weaponsWon",
  "advDiffs",
  "cosmetics",
  "gauntletBest",
]);
function overlayNormalChanges(target: Tracker, baseline: Tracker, current: Tracker, root = true): void {
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    if (root && RECEIPT_OWNED_FIELDS.has(key)) continue;
    if (JSON.stringify(baseline[key]) === JSON.stringify(current[key])) continue;
    if (!(key in current)) {
      Reflect.deleteProperty(target, key);
      continue;
    }
    const before = record(baseline[key]),
      after = record(current[key]),
      destination = record(target[key]);
    if (before && after && destination) overlayNormalChanges(destination, before, after, false);
    else target[key] = structuredClone(current[key]);
  }
}

export function createProfileStore(options: ProfileStoreOptions): ProfileStore {
  const countedBiomeNames = options.countedBiomeNames === undefined ? null : new Set(options.countedBiomeNames);
  const countBiomes = (value: unknown): number =>
    Object.keys(record(value) ?? {}).filter((name) => countedBiomeNames === null || countedBiomeNames.has(name)).length;
  const now = options.now ?? Date.now;
  let envelope: ProfileEnvelopeV2 | null = null;
  let envelopeWritable = true;
  const fresh = (): ProfileData => freshProfile(now());

  let knownProfile = fresh();
  const mergeData = (target: ProfileData, remote: unknown): void => {
    const source = record(remote);
    if (!source) return;
    target.shards = Math.max(target.shards, finiteOrZero(source.shards));
    const remoteStats = record(source.stats);
    if (remoteStats)
      for (const [key, value] of safeEntries(remoteStats)) {
        const local = ownValue(target.stats, key);
        const remoteMap = record(value);
        if (key.startsWith("_") && remoteMap) {
          target.stats[key] = { ...(record(local) ?? {}), ...Object.fromEntries(safeEntries(remoteMap)) };
        } else target.stats[key] = Math.max(finiteOrZero(local), finiteOrZero(value));
      }
    const remoteAchievements = numberMap(source.ach);
    for (const [id, timestamp] of Object.entries(remoteAchievements)) {
      const local = ownValue(target.ach, id);
      if (local === undefined || timestamp < local) target.ach[id] = timestamp;
    }
    if (
      typeof source.username === "string" &&
      finiteOrZero(source.usernameSetAt) > finiteOrZero(target.usernameSetAt)
    ) {
      target.username = source.username;
      target.usernameSetAt = finiteOrZero(source.usernameSetAt);
    }
    if (source.cosmetics !== undefined || target.cosmetics !== undefined)
      target.cosmetics = mergeCosmeticStates(
        normalizeCosmeticState(target.cosmetics),
        normalizeCosmeticState(source.cosmetics),
        options.getCosmeticCatalog?.(),
      );
    if (source.gauntletBest !== undefined || target.gauntletBest !== undefined)
      target.gauntletBest = mergeGauntletBests(
        normalizeGauntletBests(target.gauntletBest),
        normalizeGauntletBests(source.gauntletBest),
      );
    Object.assign(target.modes, boolMap(source.modes));
    Object.assign(target.seen, boolMap(source.seen));
    const rewards = record(source.rewards);
    if (rewards) target.rewards = { ...(target.rewards ?? {}), ...rewards };
    const remoteFinale = record(source.pendingFinale);
    if (
      remoteFinale &&
      (!target.pendingFinale || finiteOrZero(remoteFinale.savedAt) > finiteOrZero(target.pendingFinale.savedAt))
    ) {
      target.pendingFinale = remoteFinale;
    }
    const mergeSet = (key: "weaponsWon" | "advDiffs") => {
      const incoming = numberMap(source[key]);
      if (Object.keys(incoming).length === 0) return;
      const values = target[key] ?? {};
      for (const id of Object.keys(incoming)) values[id] = 1;
      target[key] = values;
    };
    mergeSet("weaponsWon");
    mergeSet("advDiffs");
    target.stats.biomesSeen = Math.max(finiteOrZero(target.stats.biomesSeen), countBiomes(target.stats._biomes));
    target.stats.modesPlayed = Math.max(finiteOrZero(target.stats.modesPlayed), Object.keys(target.modes).length);
    if (target.weaponsWon)
      target.stats.distinctWeaponsWon = Math.max(
        finiteOrZero(target.stats.distinctWeaponsWon),
        Object.keys(target.weaponsWon).length,
      );
    if (target.advDiffs)
      target.stats.clearAdvAll = Math.max(finiteOrZero(target.stats.clearAdvAll), Object.keys(target.advDiffs).length);
    if (target.tutorialCompletion !== undefined || source.tutorialCompletion !== undefined) {
      const left = tutorialLedger(target.tutorialCompletion),
        right = tutorialLedger(source.tutorialCompletion);
      left.floor = Math.max(left.floor, finiteOrZero(target.stats.tutorialDone));
      right.floor = Math.max(right.floor, finiteOrZero(remoteStats?.tutorialDone));
      const ledger = mergeTutorialLedgers(left, right);
      target.tutorialCompletion = ledger;
      target.stats.tutorialDone = tutorialCount(ledger);
    }
    if (target.achievementOutbox !== undefined || source.achievementOutbox !== undefined) {
      const left = achievementOutbox(target.achievementOutbox),
        right = achievementOutbox(source.achievementOutbox);
      left.floorCoins = Math.max(left.floorCoins, finiteOrZero(target.stats.coinsEarned));
      right.floorCoins = Math.max(right.floorCoins, finiteOrZero(remoteStats?.coinsEarned));
      left.floorShards = Math.max(left.floorShards, target.shards);
      right.floorShards = Math.max(right.floorShards, finiteOrZero(source.shards));
      const ledger = mergeAchievementOutboxes(left, right);
      target.achievementOutbox = ledger;
      target.shards = outboxShards(ledger);
      target.stats.coinsEarned = outboxCoins(ledger);
    }
    for (const [key, value] of safeEntries(source)) if (!hasOwnKey(target, key)) target[key] = structuredClone(value);
  };
  /** Records one receipt in the outbox, counting coins and shards added outside it; false if it does not pay. */
  const grantInto = (target: ProfileData, id: string, grant: AchievementGrant): boolean => {
    const coins = finiteOrZero(target.stats.coinsEarned);
    const outbox = addGrant(achievementOutbox(target.achievementOutbox, coins, target.shards), id, grant, {
      coins,
      shards: target.shards,
    });
    if (!outbox) return false;
    target.achievementOutbox = outbox;
    target.shards = outboxShards(outbox);
    target.stats.coinsEarned = outboxCoins(outbox);
    return true;
  };
  const unlockInto = (target: ProfileData, achievement: AchievementDefinition): boolean => {
    if (ownValue(target.ach, achievement.id) !== undefined) return false;
    grantInto(target, `achievement:${achievement.id}`, {
      coins: achievement.coins ?? options.getAchievements()?.coinsFor(achievement) ?? 0,
      shards: achievement.shards ?? options.getAchievements()?.shardsFor?.(achievement) ?? 0,
      acknowledged: false,
    });
    target.ach[achievement.id] = now();
    return true;
  };
  const commit = async (change: (target: ProfileData) => void = () => undefined): Promise<CompletionStatus> => {
    if (!options.store.acknowledged) return "unavailable";
    let atWrite = structuredClone(profile.data);
    const result = await options.store.acknowledged.update("tear_profile_v2", (text) => {
      if (!envelopeWritable) throw new Error("Profile envelope is not writable");
      const persisted = text === null ? null : migrateProfileEnvelope(JSON.parse(text) as unknown, now());
      if (persisted && !persisted.ok) throw new Error("Unsupported stored profile");
      atWrite = structuredClone(profile.data);
      const candidate = persisted?.ok
        ? Object.assign(fresh(), mutableProfileWorkingCopy(persisted.value))
        : structuredClone(atWrite);
      mergeData(candidate, atWrite);
      overlayNormalChanges(candidate, knownProfile, atWrite);
      change(candidate);
      const migrated = migrateProfileEnvelope(
        {
          schema: "tear.profile",
          schemaVersion: PROFILE_ENVELOPE_VERSION,
          revision: Math.max(envelope?.revision ?? 0, persisted?.ok ? persisted.value.revision : 0) + 1,
          updatedAtMs: now(),
          writerId: options.writerId(),
          profile: candidate,
          extensions: persisted?.ok ? persisted.value.extensions : (envelope?.extensions ?? {}),
        },
        now(),
      );
      if (!migrated.ok) throw new Error("Invalid candidate profile");
      return JSON.stringify(migrated.value);
    });
    if (result.status !== "committed") return result.status;
    const migrated = migrateProfileEnvelope(JSON.parse(result.value) as unknown, now());
    if (!migrated.ok) return "unknown";
    envelope = migrated.value;
    const committed: ProfileData = Object.assign(fresh(), mutableProfileWorkingCopy(migrated.value)),
      current = profile.data;
    const merged = structuredClone(committed);
    if (merged.achievementOutbox !== undefined && current.achievementOutbox === undefined) {
      const ledger = achievementOutbox(merged.achievementOutbox);
      ledger.baselineCoins += Math.max(
        0,
        finiteOrZero(current.stats.coinsEarned) - finiteOrZero(atWrite.stats.coinsEarned),
      );
      ledger.baselineShards += Math.max(0, current.shards - atWrite.shards);
      merged.achievementOutbox = ledger;
    }
    mergeData(merged, current);
    overlayNormalChanges(merged, atWrite, current);
    profile.data = merged;
    knownProfile = structuredClone(committed);
    // Compatibility mirror is not the acknowledged authority.
    try {
      options.store.set("tear_profile", JSON.stringify(profile.data));
    } catch {
      /* mirror is not authority */
    }
    options.onCommitted?.();
    return "committed";
  };
  /**
   * Runs one cosmetic change through the acknowledged commit, or directly on a plain local store. `apply` sets
   * `result.value` to what happened; a committed change is saved, anything else is reported as it is.
   */
  async function runCosmeticChange<Outcome extends string>(
    self: ProfileStore,
    initial: Outcome,
    apply: (target: ProfileData, result: { value: Outcome }) => void,
  ): Promise<CompletionStatus | Outcome> {
    const result = { value: initial };
    if (!options.store.acknowledged) {
      apply(self.data, result);
      if (result.value === "committed") self.save();
      return result.value;
    }
    const status = await commit((target) => {
      apply(target, result);
    });
    return status === "committed" ? result.value : status;
  }
  const profile: ProfileStore = {
    KEY: PROFILE_MIRROR_KEY,
    ENVELOPE_KEY: PROFILE_ENVELOPE_KEY,
    data: fresh(),
    flushAcknowledged: () => commit(),
    async issueTutorial(id) {
      if (!isTutorialCourseId(id)) return "unknown";
      return commit((target) => {
        const ledger = tutorialLedger(target.tutorialCompletion, finiteOrZero(target.stats.tutorialDone));
        ledger.courses[id] ??= "issued";
        target.tutorialCompletion = ledger;
      });
    },
    async completeTutorial(id) {
      if (!isTutorialCourseId(id)) return "unknown";
      let outcome: CompletionStatus = "unknown";
      const status = await commit((target) => {
        const ledger = tutorialLedger(target.tutorialCompletion, finiteOrZero(target.stats.tutorialDone));
        if (ledger.courses[id] === undefined) return;
        if (ledger.courses[id] === "completed") {
          outcome = "already";
          return;
        }
        ledger.baseline =
          tutorialCount(ledger) - Object.values(ledger.courses).filter((state) => state === "completed").length;
        ledger.courses[id] = "completed";
        target.tutorialCompletion = ledger;
        target.stats.tutorialDone = tutorialCount(ledger);
        const apprentice = options.getAchievements()?.byId("student");
        if (apprentice) unlockInto(target, apprentice);
        else throw new Error("Apprentice definition unavailable");
        outcome = "committed";
      });
      return status === "committed" ? outcome : status;
    },
    pendingRewards() {
      return Object.entries(achievementOutbox(this.data.achievementOutbox).grants)
        .filter(([, grant]) => !grant.acknowledged)
        .map(([id, grant]) => ({ id, coins: grant.coins }));
    },
    acknowledgeReward(id) {
      return commit((target) => {
        const outbox = achievementOutbox(target.achievementOutbox);
        const grant = outbox.grants[id];
        if (grant) grant.acknowledged = true;
        target.achievementOutbox = outbox;
      });
    },
    load() {
      const stored = readStoredProfile(options.store, envelope, now());
      envelope = stored.envelope;
      envelopeWritable = stored.writable;
      if (stored.problem !== null) options.reportProblem?.(stored.problem);
      const raw = stored.raw;
      const source = raw ?? {};
      this.data = Object.assign(fresh(), source, {
        ach: numberMap(source.ach),
        stats: record(source.stats) ?? {},
        seen: boolMap(source.seen),
        modes: boolMap(source.modes),
      });
      knownProfile = structuredClone(this.data);
      if (options.store.acknowledged) this.data.achCoinsRetrofit = true;
      if (options.getAchievements() && options.getMeta()?.data && !this.data.achCoinsRetrofit) this.retrofitCoins();
      options.onLoaded?.();
      return this.data;
    },
    save() {
      if (options.store.acknowledged) {
        void commit();
        return;
      }
      try {
        const migrated = migrateProfileEnvelope(
          {
            schema: "tear.profile",
            schemaVersion: PROFILE_ENVELOPE_VERSION,
            revision: (envelope?.revision ?? 0) + 1,
            updatedAtMs: now(),
            writerId: options.writerId(),
            profile: this.data,
            extensions: envelope?.extensions ?? {},
          },
          now(),
        );
        if (migrated.ok && envelopeWritable) {
          envelope = migrated.value;
          options.store.set(this.ENVELOPE_KEY, JSON.stringify(migrated.value));
        }
        options.store.set(this.KEY, JSON.stringify(this.data));
      } catch {
        /* local memory state remains valid */
      }
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
    username() {
      return typeof this.data.username === "string" ? this.data.username : "";
    },
    usernameSetAt() {
      return finiteOrZero(this.data.usernameSetAt);
    },
    setUsername(name) {
      this.data.username = name;
      this.data.usernameSetAt = now();
      this.save();
    },
    shards() {
      return finiteOrZero(this.data.shards);
    },
    claimShards(receiptId, shards) {
      const claimed = grantInto(this.data, receiptId, { coins: 0, shards, acknowledged: true });
      if (claimed) this.save();
      return claimed;
    },
    shardsClaimable(receiptId) {
      return receiptOpen(achievementOutbox(this.data.achievementOutbox), receiptId);
    },
    cosmetics() {
      return normalizeCosmeticState(this.data.cosmetics);
    },
    gauntletBest(difficulty) {
      return ownValue(normalizeGauntletBests(this.data.gauntletBest), difficulty) ?? null;
    },
    recordGauntletClear(difficulty, clear) {
      const bests = normalizeGauntletBests(this.data.gauntletBest);
      if (!betterGauntletClear(clear, ownValue(bests, difficulty))) return false;
      this.data.gauntletBest = { ...bests, [difficulty]: { ticks: clear.ticks, hits: clear.hits } };
      this.save();
      return true;
    },
    shardBalance() {
      return shardBalance(finiteOrZero(this.data.shards), normalizeCosmeticState(this.data.cosmetics));
    },
    async buyCosmetic(itemId) {
      const catalog = options.getCosmeticCatalog?.();
      if (!catalog) return "unknown";
      return runCosmeticChange<PurchaseRefusal | "committed">(this, "unknown", (target, result) => {
        const purchase = purchaseCosmetic(
          catalog,
          normalizeCosmeticState(target.cosmetics),
          itemId,
          finiteOrZero(target.shards),
          progressFacts(target),
        );
        if (!purchase.ok) {
          result.value = purchase.reason;
          return;
        }
        target.cosmetics = purchase.state;
        result.value = "committed";
      });
    },
    async equipCosmetic(slot, itemId) {
      const catalog = options.getCosmeticCatalog?.();
      if (!catalog) return "unknown";
      return runCosmeticChange<CompletionStatus>(this, "unknown", (target, result) => {
        const next = equipCosmetic(catalog, normalizeCosmeticState(target.cosmetics), slot, itemId, now());
        if (!next) return;
        target.cosmetics = next;
        result.value = "committed";
      });
    },
    async claimCosmeticGrants() {
      const catalog = options.getCosmeticCatalog?.();
      if (!catalog) return "unknown";
      return runCosmeticChange<CompletionStatus>(this, "unknown", (target, result) => {
        const state = normalizeCosmeticState(target.cosmetics);
        const ids = claimableGrants(catalog, state, progressFacts(target));
        result.value = ids.length === 0 ? "already" : "committed";
        if (ids.length > 0) target.cosmetics = grantItems(state, ids);
      });
    },
    async markCosmeticsSeen(itemIds) {
      return runCosmeticChange<CompletionStatus>(this, "unknown", (target, result) => {
        const state = normalizeCosmeticState(target.cosmetics);
        const next = markSeen(state, itemIds, now());
        result.value = Object.keys(next.seen).length === Object.keys(state.seen).length ? "already" : "committed";
        if (result.value === "committed") target.cosmetics = next;
      });
    },
    stat(key) {
      return finiteOrZero(ownValue(this.data.stats, key));
    },
    facts() {
      return progressFacts(this.data);
    },
    addStat(key, amount = 1) {
      this.data.stats[key] = finiteOrZero(ownValue(this.data.stats, key)) + amount;
      if (key === "coinsEarned" && this.data.achievementOutbox !== undefined) {
        const ledger = achievementOutbox(this.data.achievementOutbox);
        ledger.baselineCoins =
          outboxCoins(ledger) - Object.values(ledger.grants).reduce((sum, entry) => sum + entry.coins, 0) + amount;
        this.data.achievementOutbox = ledger;
      }
    },
    maxStat(key, value) {
      if (value > finiteOrZero(ownValue(this.data.stats, key))) this.data.stats[key] = value;
    },
    markBiome(name) {
      const seen = record(this.data.stats._biomes) ?? {};
      seen[name] = 1;
      this.data.stats._biomes = seen;
      return countBiomes(seen);
    },
    markMode(id) {
      if (!this.data.modes[id]) {
        this.data.modes[id] = true;
        this.addStat("modesPlayed", 1);
      }
    },
    modesPlayed() {
      return Object.keys(this.data.modes).length;
    },
    pendingFinale() {
      return record(this.data.pendingFinale);
    },
    setPendingFinale(payload = {}) {
      this.data.pendingFinale = { savedAt: now(), ...payload };
      this.save();
    },
    clearPendingFinale() {
      delete this.data.pendingFinale;
      this.save();
    },
    unlocked(id) {
      return ownValue(this.data.ach, id) !== undefined;
    },
    unlock(achievement) {
      if (options.store.acknowledged) {
        const unlocked = unlockInto(this.data, achievement);
        if (unlocked) this.save();
        return unlocked;
      }
      if (this.unlocked(achievement.id)) return false;
      this.data.ach[achievement.id] = now();
      this.data.shards += achievement.shards ?? 0;
      if (achievement.coins) {
        options.getMeta()?.addCoins(achievement.coins);
        this.addStat("coinsEarned", achievement.coins);
      }
      this.save();
      return true;
    },
    unlockedCount() {
      return Object.keys(this.data.ach).length;
    },
    merge(remote) {
      mergeData(this.data, remote);
    },
  };
  return profile;
}
