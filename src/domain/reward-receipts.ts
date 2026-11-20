/** Data-only, versioned receipt projections shared by profile and currency owners. */
import { requireRecord } from "./records";

/** A backing-store acknowledgement; memory fallback is never a durable commit. */
export type StorageAcknowledgement<T> =
  Readonly<{ status: "committed"; value: T }> | Readonly<{ status: "unavailable" | "unknown"; reason: string }>;
export interface AcknowledgedStorage {
  read(key: string): Promise<StorageAcknowledgement<string | null>>;
  update(key: string, change: (current: string | null) => string): Promise<StorageAcknowledgement<string>>;
}
export type CompletionStatus = "committed" | "already" | "unknown" | "unavailable";
export interface TutorialCourseLedger {
  version: 1;
  baseline: number;
  floor: number;
  courses: Record<string, "issued" | "completed">;
}
export interface AchievementGrant {
  coins: number;
  shards: number;
  acknowledged: boolean;
}
/**
 * Every coin and shard grant that has an identity: `achievement:<id>` for an achievement, and
 * `daily:<date>:<challenge id>` for a daily-challenge claim. A receipt pays once, and merging two devices'
 * outboxes keeps one copy of each.
 */
export interface AchievementOutbox {
  version: 1;
  baselineCoins: number;
  floorCoins: number;
  baselineShards: number;
  floorShards: number;
  grants: Record<string, AchievementGrant>;
  /** The newest day (days since 1970-01-01) whose daily receipts were folded into the baseline (`closeOldDays`). */
  dailyClosedThrough?: number;
}
export interface CurrencyGrantLedger {
  version: 1;
  baseline: number;
  floor: number;
  receipts: Record<string, number>;
}
const object = (value: unknown): Record<string, unknown> => requireRecord(value, "Invalid reward ledger object");
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const amount = (value: unknown): number => {
  if (!isAmount(value)) throw new TypeError("Invalid reward ledger amount");
  return value;
};
const ACHIEVEMENT_RECEIPT = /^achievement:[a-z0-9_]+$/u;
/** A daily-challenge claim: `daily:<date>:<challenge id>`, the date written by `dailyDateKey`. */
const DAILY_RECEIPT = /^daily:(\d{4})-([1-9]|1[0-2])-([1-9]|[12]\d|3[01]):[a-z0-9_]+$/u;
const DAY_MS = 86_400_000;
/**
 * The daily receipts an outbox keeps: a month of three a day. Past it, the oldest days are folded into the
 * baseline and closed (`closeOldDays`), so the outbox stays bounded and a closed day never pays again. The
 * bound is a count, not a date window, so a device whose clock runs ahead cannot close today's claims for
 * every device it syncs with.
 */
export const MAX_DAILY_RECEIPTS = 90;

/** The local calendar date that picks a day's challenges and names their receipts, e.g. "2026-7-19". */
export function dailyDateKey(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1)}-${String(date.getDate())}`;
}

export const dailyReceiptId = (dateKey: string, challengeId: string): string => `daily:${dateKey}:${challengeId}`;

/** A daily receipt's day (days since 1970-01-01); null for an achievement receipt or a malformed id. */
function receiptDay(id: string): number | null {
  const match = DAILY_RECEIPT.exec(id);
  if (!match) return null;
  const day = Number(match[3]);
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, day);
  // Date.UTC rolls 2026-2-30 over into March; a real date reads its day back unchanged.
  return time >= 0 && new Date(time).getUTCDate() === day ? time / DAY_MS : null;
}

const isReceiptId = (id: string): boolean => ACHIEVEMENT_RECEIPT.test(id) || receiptDay(id) !== null;

/** Whether claiming this receipt would pay: a well-formed id, not paid yet, and not on a closed day. */
export function receiptOpen(ledger: AchievementOutbox, id: string): boolean {
  if (!isReceiptId(id) || Object.hasOwn(ledger.grants, id)) return false;
  const day = receiptDay(id);
  return day === null || ledger.dailyClosedThrough === undefined || day > ledger.dailyClosedThrough;
}

/**
 * Closes the oldest days once more than MAX_DAILY_RECEIPTS daily receipts are held, and drops every daily
 * receipt on a closed day. A whole day closes at once, so no day is left half open. Merging drops them
 * (each side's floor keeps its total); `addGrant` folds them into the baseline.
 */
function closeOldDays(ledger: AchievementOutbox): AchievementOutbox {
  const days = Object.keys(ledger.grants)
    .flatMap((id) => receiptDay(id) ?? [])
    .sort((left, right) => right - left);
  const overflow = days[MAX_DAILY_RECEIPTS];
  const closed =
    overflow === undefined ? ledger.dailyClosedThrough : Math.max(overflow, ledger.dailyClosedThrough ?? overflow);
  if (closed === undefined) return ledger;
  const grants = Object.fromEntries(
    Object.entries(ledger.grants).filter(([id]) => {
      const day = receiptDay(id);
      return day === null || day > closed;
    }),
  );
  return { ...ledger, dailyClosedThrough: closed, grants };
}

/**
 * Adds one grant, or returns null when `receiptOpen` refuses it or an amount is not a whole number of coins or
 * shards. What was counted before becomes the baseline: the outbox's totals, or `counted` when more was added
 * outside the outbox. The totals then grow by exactly the grant, and a receipt `closeOldDays` folds away stays
 * counted.
 */
export function addGrant(
  ledger: AchievementOutbox,
  id: string,
  grant: AchievementGrant,
  counted: Readonly<{ coins: number; shards: number }>,
): AchievementOutbox | null {
  if (!receiptOpen(ledger, id) || !isAmount(grant.coins) || !isAmount(grant.shards)) return null;
  const coins = Math.max(outboxCoins(ledger), counted.coins) + grant.coins,
    shards = Math.max(outboxShards(ledger), counted.shards) + grant.shards;
  const next = closeOldDays({ ...ledger, grants: { ...ledger.grants, [id]: { ...grant } } });
  const kept = Object.values(next.grants);
  return {
    ...next,
    baselineCoins: coins - kept.reduce((sum, entry) => sum + entry.coins, 0),
    baselineShards: shards - kept.reduce((sum, entry) => sum + entry.shards, 0),
  };
}
export function isTutorialCourseId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id);
}
export function tutorialLedger(value: unknown, baseline = 0): TutorialCourseLedger {
  if (value === undefined) return { version: 1, baseline, floor: baseline, courses: {} };
  const data = object(value),
    courses = object(data.courses);
  if (
    data.version !== 1 ||
    Object.entries(courses).some(
      ([id, state]) => !isTutorialCourseId(id) || (state !== "issued" && state !== "completed"),
    )
  )
    throw new TypeError("Invalid tutorial course ledger");
  return {
    ...structuredClone(data),
    version: 1,
    baseline: amount(data.baseline),
    floor: amount(data.floor),
    courses: { ...courses },
  } as TutorialCourseLedger;
}
export function mergeTutorialLedgers(left: TutorialCourseLedger, right: TutorialCourseLedger): TutorialCourseLedger {
  const courses = { ...left.courses };
  for (const [id, state] of Object.entries(right.courses)) if (courses[id] !== "completed") courses[id] = state;
  return {
    ...right,
    ...left,
    version: 1,
    baseline: Math.max(left.baseline, right.baseline),
    floor: Math.max(left.floor, right.floor),
    courses,
  };
}
export const tutorialCount = (ledger: TutorialCourseLedger): number =>
  Math.max(
    ledger.floor,
    ledger.baseline + Object.values(ledger.courses).filter((state) => state === "completed").length,
  );
export function achievementOutbox(value: unknown, coins = 0, shards = 0): AchievementOutbox {
  if (value === undefined)
    return {
      version: 1,
      baselineCoins: coins,
      floorCoins: coins,
      baselineShards: shards,
      floorShards: shards,
      grants: {},
    };
  const data = object(value),
    grants: Record<string, AchievementGrant> = {};
  if (data.version !== 1) throw new TypeError("Unsupported achievement outbox");
  for (const [id, value] of Object.entries(object(data.grants))) {
    const grant = object(value);
    if (!isReceiptId(id) || typeof grant.acknowledged !== "boolean") throw new TypeError("Invalid achievement grant");
    grants[id] = {
      ...structuredClone(grant),
      coins: amount(grant.coins),
      shards: amount(grant.shards),
      acknowledged: grant.acknowledged,
    };
  }
  return {
    ...structuredClone(data),
    version: 1,
    baselineCoins: amount(data.baselineCoins),
    floorCoins: amount(data.floorCoins),
    baselineShards: amount(data.baselineShards),
    floorShards: amount(data.floorShards),
    grants,
    ...(data.dailyClosedThrough === undefined ? {} : { dailyClosedThrough: amount(data.dailyClosedThrough) }),
  };
}
/**
 * Keeps one copy of every receipt from both sides; commutative, associative and idempotent. Two builds may
 * pay the same daily challenge differently, and a claim migrated from a version 4 save pays nothing (its
 * shards are already in the baseline). A daily receipt therefore keeps the smaller amount, and each side's
 * floor keeps its total. Two different amounts for one achievement are still an error.
 */
export function mergeAchievementOutboxes(left: AchievementOutbox, right: AchievementOutbox): AchievementOutbox {
  const grants = { ...left.grants };
  for (const [id, grant] of Object.entries(right.grants)) {
    const existing = grants[id];
    if (existing && (existing.coins !== grant.coins || existing.shards !== grant.shards) && receiptDay(id) === null)
      throw new TypeError("Conflicting achievement grant");
    grants[id] = {
      ...grant,
      ...existing,
      coins: Math.min(grant.coins, existing?.coins ?? grant.coins),
      shards: Math.min(grant.shards, existing?.shards ?? grant.shards),
      acknowledged: grant.acknowledged || existing?.acknowledged === true,
    };
  }
  const closed = [left.dailyClosedThrough, right.dailyClosedThrough].filter((day) => day !== undefined);
  return closeOldDays({
    ...right,
    ...left,
    version: 1,
    baselineCoins: Math.max(left.baselineCoins, right.baselineCoins),
    floorCoins: Math.max(left.floorCoins, right.floorCoins),
    baselineShards: Math.max(left.baselineShards, right.baselineShards),
    floorShards: Math.max(left.floorShards, right.floorShards),
    grants,
    ...(closed.length > 0 ? { dailyClosedThrough: Math.max(...closed) } : {}),
  });
}
export const outboxCoins = (ledger: AchievementOutbox): number =>
  Math.max(
    ledger.floorCoins,
    ledger.baselineCoins + Object.values(ledger.grants).reduce((sum, grant) => sum + grant.coins, 0),
  );
export const outboxShards = (ledger: AchievementOutbox): number =>
  Math.max(
    ledger.floorShards,
    ledger.baselineShards + Object.values(ledger.grants).reduce((sum, grant) => sum + grant.shards, 0),
  );
export function currencyLedger(value: unknown, baseline = 0): CurrencyGrantLedger {
  if (value === undefined) return { version: 1, baseline, floor: baseline, receipts: {} };
  const data = object(value),
    receipts: Record<string, number> = {};
  if (data.version !== 1) throw new TypeError("Unsupported currency receipt ledger");
  for (const [id, value] of Object.entries(object(data.receipts))) {
    if (!/^achievement:[a-z0-9_]+$/u.test(id)) throw new TypeError("Invalid currency receipt id");
    receipts[id] = amount(value);
  }
  return { ...structuredClone(data), version: 1, baseline: amount(data.baseline), floor: amount(data.floor), receipts };
}
export function mergeCurrencyLedgers(left: CurrencyGrantLedger, right: CurrencyGrantLedger): CurrencyGrantLedger {
  const receipts = { ...left.receipts };
  for (const [id, coins] of Object.entries(right.receipts)) {
    if (receipts[id] !== undefined && receipts[id] !== coins) throw new TypeError("Conflicting currency receipt");
    receipts[id] = coins;
  }
  return {
    ...right,
    ...left,
    version: 1,
    baseline: Math.max(left.baseline, right.baseline),
    floor: Math.max(left.floor, right.floor),
    receipts,
  };
}
export const currencyEarned = (ledger: CurrencyGrantLedger): number =>
  Math.max(ledger.floor, ledger.baseline + Object.values(ledger.receipts).reduce((sum, coins) => sum + coins, 0));
