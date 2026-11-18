import { dailyDateKey, dailyReceiptId } from "../../domain/reward-receipts";
import type { Achievement } from "./achievements";

export type DailyProgressMode = "add" | "max";

export interface DailyChallenge {
  readonly id: string;
  readonly key: string;
  readonly mode: DailyProgressMode;
  readonly goal: number;
  readonly shards: number;
  txt(goal: number): string;
}

/** Today's progress. Which challenges have paid is not kept here: each claim is a receipt in the profile. */
export interface DailyState {
  date: string;
  prog: Record<string, number>;
}

interface StoredDailyState {
  date?: string;
  prog?: Record<string, number>;
}

export interface DailyProfilePort {
  readonly data: { daily?: StoredDailyState; readonly [key: string]: unknown };
  /** Pays once per receipt and saves; false when the receipt was paid already or its day is closed. */
  claimShards(receiptId: string, shards: number): boolean;
  shardsClaimable(receiptId: string): boolean;
  save(): void;
}

export interface DailyAchievementsPort {
  readonly pending: Achievement[];
}

export interface CalendarClockPort {
  now(): Date;
  nextLocalMidnight(current: Date): Date;
}

export interface DailyChallenges {
  readonly POOL: readonly DailyChallenge[];
  todayKey(): string;
  msToReset(): number;
  resetsInText(): string;
  today(): readonly DailyChallenge[];
  progress(challenge: DailyChallenge): number;
  isDone(challenge: DailyChallenge): boolean;
  bump(key: string, value?: number, mode?: DailyProgressMode): void;
  check(): void;
  doneCount(): number;
}

export interface DailyChallengeDependencies {
  readonly achievements: DailyAchievementsPort;
  readonly profile: DailyProfilePort;
  readonly clock: CalendarClockPort;
}

export function localCalendarClock(): CalendarClockPort {
  return {
    now: () => new Date(),
    nextLocalMidnight(current) {
      return new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    },
  };
}

export function selectDailyChallenges(
  dateKey: string,
  pool: readonly DailyChallenge[],
  count = 3,
): readonly DailyChallenge[] {
  let seed = 0;
  for (let index = 0; index < dateKey.length; index += 1) seed = (seed * 31 + dateKey.charCodeAt(index)) >>> 0;
  const indices = pool.map((_challenge, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    const swapIndex = seed % (index + 1);
    const current = indices[index];
    const swap = indices[swapIndex];
    if (current === undefined || swap === undefined) continue;
    indices[index] = swap;
    indices[swapIndex] = current;
  }
  return indices.slice(0, count).flatMap((index) => (pool[index] ? [pool[index]] : []));
}

export function createDailyChallenges(dependencies: DailyChallengeDependencies): DailyChallenges {
  const pool: readonly DailyChallenge[] = Object.freeze([
    {
      id: "d_kills",
      key: "kills",
      mode: "add",
      goal: 150,
      shards: 15,
      txt: (goal) => `Defeat ${String(goal)} enemies`,
    },
    {
      id: "d_parry",
      key: "parries",
      mode: "add",
      goal: 15,
      shards: 15,
      txt: (goal) => `Land ${String(goal)} perfect parries`,
    },
    { id: "d_boss", key: "boss", mode: "add", goal: 2, shards: 20, txt: (goal) => `Defeat ${String(goal)} bosses` },
    {
      id: "d_nohit",
      key: "nohit",
      mode: "add",
      goal: 5,
      shards: 15,
      txt: (goal) => `Clear ${String(goal)} waves without being hit`,
    },
    {
      id: "d_wave",
      key: "wave",
      mode: "max",
      goal: 15,
      shards: 20,
      txt: (goal) => `Reach wave ${String(goal)} in one run`,
    },
    {
      id: "d_superslam",
      key: "superslam",
      mode: "add",
      goal: 8,
      shards: 15,
      txt: (goal) => `Land ${String(goal)} power slams`,
    },
    {
      id: "d_updraft",
      key: "updraft",
      mode: "add",
      goal: 10,
      shards: 15,
      txt: (goal) => `Land ${String(goal)} updraft launches`,
    },
    { id: "d_runs", key: "runs", mode: "add", goal: 3, shards: 10, txt: (goal) => `Finish ${String(goal)} runs` },
    {
      id: "d_deflect",
      key: "deflect",
      mode: "add",
      goal: 40,
      shards: 12,
      txt: (goal) => `Deflect ${String(goal)} projectiles`,
    },
    { id: "d_air", key: "air", mode: "add", goal: 25, shards: 12, txt: (goal) => `Land ${String(goal)} airborne hits` },
  ]);

  const ensure = (): DailyState => {
    const key = daily.todayKey();
    const current = dependencies.profile.data.daily;
    if (current?.date !== key) {
      const next = { date: key, prog: {} };
      dependencies.profile.data.daily = next;
      dependencies.profile.save();
      return next;
    }
    if (!current.prog) {
      const repaired: DailyState = { date: current.date, prog: {} };
      dependencies.profile.data.daily = repaired;
      dependencies.profile.save();
      return repaired;
    }
    return { date: current.date, prog: current.prog };
  };
  const receipt = (challenge: DailyChallenge): string => dailyReceiptId(daily.todayKey(), challenge.id);

  const daily: DailyChallenges = {
    POOL: pool,
    todayKey() {
      return dailyDateKey(dependencies.clock.now());
    },
    msToReset() {
      const current = dependencies.clock.now();
      return Math.max(0, dependencies.clock.nextLocalMidnight(current).getTime() - current.getTime());
    },
    resetsInText() {
      const milliseconds = this.msToReset();
      const hours = Math.floor(milliseconds / 3_600_000);
      const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
      return hours > 0 ? `${String(hours)}h ${String(minutes)}m` : `${String(minutes)}m`;
    },
    today() {
      return selectDailyChallenges(this.todayKey(), pool);
    },
    progress(challenge) {
      return Math.min(ensure().prog[challenge.key] ?? 0, challenge.goal);
    },
    isDone(challenge) {
      return !dependencies.profile.shardsClaimable(receipt(challenge));
    },
    bump(key, value = 1, mode = "add") {
      const selected = this.today();
      if (!selected.some((challenge) => challenge.key === key)) return;
      const state = ensure();
      state.prog[key] = mode === "max" ? Math.max(state.prog[key] ?? 0, value) : (state.prog[key] ?? 0) + value;
      this.check();
    },
    check() {
      const state = ensure();
      for (const challenge of this.today()) {
        if ((state.prog[challenge.key] ?? 0) < challenge.goal) continue;
        if (!dependencies.profile.claimShards(receipt(challenge), challenge.shards)) continue;
        dependencies.achievements.pending.push({
          id: `daily_${challenge.id}`,
          name: "Daily Complete",
          desc: challenge.txt(challenge.goal),
          rarity: "uncommon",
          cat: "mastery",
          shards: challenge.shards,
        });
      }
    },
    doneCount() {
      return this.today().filter((challenge) => this.isDone(challenge)).length;
    },
  };
  return daily;
}
