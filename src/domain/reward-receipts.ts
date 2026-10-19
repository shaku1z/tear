/** Data-only, versioned receipt projections shared by profile and currency owners. */
/** A backing-store acknowledgement; memory fallback is never a durable commit. */
export type StorageAcknowledgement<T> = Readonly<{ status: "committed"; value: T }>
  | Readonly<{ status: "unavailable" | "unknown"; reason: string }>;
export interface AcknowledgedStorage {
  read(key: string): Promise<StorageAcknowledgement<string | null>>;
  update(key: string, change: (current: string | null) => string): Promise<StorageAcknowledgement<string>>;
}
export type CompletionStatus = "committed" | "already" | "unknown" | "unavailable";
export interface TutorialCourseLedger {
  version: 1; baseline: number; floor: number; courses: Record<string, "issued" | "completed">;
}
export interface AchievementGrant { coins: number; shards: number; acknowledged: boolean }
export interface AchievementOutbox {
  version: 1; baselineCoins: number; floorCoins: number; baselineShards: number; floorShards: number;
  grants: Record<string, AchievementGrant>;
}
export interface CurrencyGrantLedger { version: 1; baseline: number; floor: number; receipts: Record<string, number> }
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Invalid reward ledger object");
  return value as Record<string, unknown>;
};
const amount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid reward ledger amount");
  return value;
};
export function isTutorialCourseId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id);
}
export function tutorialLedger(value: unknown, baseline = 0): TutorialCourseLedger {
  if (value === undefined) return { version: 1, baseline, floor: baseline, courses: {} };
  const data = object(value), courses = object(data.courses);
  if (data.version !== 1 || Object.entries(courses).some(([id, state]) => !isTutorialCourseId(id) || (state !== "issued" && state !== "completed"))) throw new TypeError("Invalid tutorial course ledger");
  return { ...structuredClone(data), version: 1, baseline: amount(data.baseline), floor: amount(data.floor), courses: { ...courses } } as TutorialCourseLedger;
}
export function mergeTutorialLedgers(left: TutorialCourseLedger, right: TutorialCourseLedger): TutorialCourseLedger {
  const courses = { ...left.courses };
  for (const [id, state] of Object.entries(right.courses)) if (courses[id] !== "completed") courses[id] = state;
  return { ...right, ...left, version: 1, baseline: Math.max(left.baseline, right.baseline), floor: Math.max(left.floor, right.floor), courses };
}
export const tutorialCount = (ledger: TutorialCourseLedger): number => Math.max(ledger.floor, ledger.baseline + Object.values(ledger.courses).filter((state) => state === "completed").length);
export function achievementOutbox(value: unknown, coins = 0, shards = 0): AchievementOutbox {
  if (value === undefined) return { version: 1, baselineCoins: coins, floorCoins: coins, baselineShards: shards, floorShards: shards, grants: {} };
  const data = object(value), grants: Record<string, AchievementGrant> = {};
  if (data.version !== 1) throw new TypeError("Unsupported achievement outbox");
  for (const [id, value] of Object.entries(object(data.grants))) {
    const grant = object(value);
    if (!/^achievement:[a-z0-9_]+$/u.test(id) || typeof grant.acknowledged !== "boolean") throw new TypeError("Invalid achievement grant");
    grants[id] = { ...structuredClone(grant), coins: amount(grant.coins), shards: amount(grant.shards), acknowledged: grant.acknowledged };
  }
  return { ...structuredClone(data), version: 1, baselineCoins: amount(data.baselineCoins), floorCoins: amount(data.floorCoins), baselineShards: amount(data.baselineShards), floorShards: amount(data.floorShards), grants };
}
export function mergeAchievementOutboxes(left: AchievementOutbox, right: AchievementOutbox): AchievementOutbox {
  const grants = { ...left.grants };
  for (const [id, grant] of Object.entries(right.grants)) {
    const existing = grants[id];
    if (existing && (existing.coins !== grant.coins || existing.shards !== grant.shards)) throw new TypeError("Conflicting achievement grant");
    grants[id] = { ...grant, ...existing, acknowledged: grant.acknowledged || existing?.acknowledged === true };
  }
  return { ...right, ...left, version: 1, baselineCoins: Math.max(left.baselineCoins, right.baselineCoins), floorCoins: Math.max(left.floorCoins, right.floorCoins), baselineShards: Math.max(left.baselineShards, right.baselineShards), floorShards: Math.max(left.floorShards, right.floorShards), grants };
}
export const outboxCoins = (ledger: AchievementOutbox): number => Math.max(ledger.floorCoins, ledger.baselineCoins + Object.values(ledger.grants).reduce((sum, grant) => sum + grant.coins, 0));
export const outboxShards = (ledger: AchievementOutbox): number => Math.max(ledger.floorShards, ledger.baselineShards + Object.values(ledger.grants).reduce((sum, grant) => sum + grant.shards, 0));
export function currencyLedger(value: unknown, baseline = 0): CurrencyGrantLedger {
  if (value === undefined) return { version: 1, baseline, floor: baseline, receipts: {} };
  const data = object(value), receipts: Record<string, number> = {};
  if (data.version !== 1) throw new TypeError("Unsupported currency receipt ledger");
  for (const [id, value] of Object.entries(object(data.receipts))) {
    if (!/^achievement:[a-z0-9_]+$/u.test(id)) throw new TypeError("Invalid currency receipt id"); receipts[id] = amount(value);
  }
  return { ...structuredClone(data), version: 1, baseline: amount(data.baseline), floor: amount(data.floor), receipts };
}
export function mergeCurrencyLedgers(left: CurrencyGrantLedger, right: CurrencyGrantLedger): CurrencyGrantLedger {
  const receipts = { ...left.receipts };
  for (const [id, coins] of Object.entries(right.receipts)) {
    if (receipts[id] !== undefined && receipts[id] !== coins) throw new TypeError("Conflicting currency receipt"); receipts[id] = coins;
  }
  return { ...right, ...left, version: 1, baseline: Math.max(left.baseline, right.baseline), floor: Math.max(left.floor, right.floor), receipts };
}
export const currencyEarned = (ledger: CurrencyGrantLedger): number => Math.max(ledger.floor, ledger.baseline + Object.values(ledger.receipts).reduce((sum, coins) => sum + coins, 0));
