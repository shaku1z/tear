/**
 * Property tests for receipts in the achievement outbox (src/domain/reward-receipts.ts): a receipt pays
 * once, even after its day is folded away; the outbox never holds more than MAX_DAILY_RECEIPTS daily
 * receipts; and merging two devices' outboxes is commutative, associative and idempotent.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_DAILY_RECEIPTS,
  achievementOutbox,
  addGrant,
  dailyDateKey,
  dailyReceiptId,
  mergeAchievementOutboxes,
  outboxCoins,
  outboxShards,
  receiptOpen,
  type AchievementOutbox,
} from "../../src/domain/reward-receipts";
import { createDailyChallenges } from "../../src/gameplay/progression/challenges";
import { checkProperty, fc } from "./property-harness";

const POOL = createDailyChallenges({
  achievements: { pending: [] },
  profile: { data: {}, claimShards: () => false, shardsClaimable: () => true, save: () => undefined },
  clock: { now: () => new Date(2026, 0, 1), nextLocalMidnight: (date) => date },
}).POOL;

/** Up to five months of days, so a run of claims passes MAX_DAILY_RECEIPTS and closes days. */
const dayKey = fc.nat({ max: 150 }).map((offset) => dailyDateKey(new Date(2026, 0, 1 + offset)));
const dailyClaim = fc
  .record({ day: dayKey, challenge: fc.constantFrom(...POOL.map((entry) => entry.id)), shards: fc.nat({ max: 50 }) })
  .map(({ day, challenge, shards }) => ({ id: dailyReceiptId(day, challenge), coins: 0, shards }));
/** An achievement's reward comes from its catalog row, so every device pays it the same. */
const achievementClaim = fc
  .stringMatching(/^[a-z0-9_]{1,12}$/u)
  .map((name) => ({ id: `achievement:${name}`, coins: 10 * name.length, shards: name.length }));
const claim = fc.oneof({ arbitrary: dailyClaim, weight: 4 }, { arbitrary: achievementClaim, weight: 1 });
interface Claim {
  readonly id: string;
  readonly coins: number;
  readonly shards: number;
}

function apply(ledger: AchievementOutbox, entry: Claim): AchievementOutbox {
  const grant = { coins: entry.coins, shards: entry.shards, acknowledged: entry.coins === 0 };
  return addGrant(ledger, entry.id, grant, { coins: 0, shards: 0 }) ?? ledger;
}
/** One device's outbox: an opening balance, then a run of claims. */
const device = fc
  .record({
    coins: fc.nat({ max: 1_000 }),
    shards: fc.nat({ max: 1_000 }),
    claims: fc.array(claim, { maxLength: 160 }),
  })
  .map(({ coins, shards, claims }) => claims.reduce(apply, achievementOutbox(undefined, coins, shards)));
const dailyCount = (ledger: AchievementOutbox) => Object.keys(ledger.grants).filter((id) => id.startsWith("daily:"));
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("outbox receipts", () => {
  it("pays a claim exactly once: the totals grow by the grant, and a second claim of the same receipt pays nothing", () => {
    checkProperty(
      fc.property(fc.array(claim, { maxLength: 160 }), (claims) => {
        let ledger = achievementOutbox(undefined);
        const paid = new Set<string>();
        for (const entry of claims) {
          const before = { coins: outboxCoins(ledger), shards: outboxShards(ledger) };
          const next = apply(ledger, entry);
          const paysNow = next !== ledger;
          // Once paid, an id never pays again, even after its day was closed and its receipt folded away.
          if (paid.has(entry.id)) expect(paysNow).toBe(false);
          if (paysNow) paid.add(entry.id);
          expect(outboxCoins(next)).toBe(before.coins + (paysNow ? entry.coins : 0));
          expect(outboxShards(next)).toBe(before.shards + (paysNow ? entry.shards : 0));
          ledger = next;
        }
      }),
    );
  });

  it("keeps at most MAX_DAILY_RECEIPTS daily receipts, none on a closed day, and refuses claims on a closed day", () => {
    checkProperty(
      fc.property(device, dailyClaim, (ledger, entry) => {
        const daily = dailyCount(ledger);
        expect(daily.length).toBeLessThanOrEqual(MAX_DAILY_RECEIPTS);
        for (const id of daily) expect(receiptOpen({ ...ledger, grants: {} }, id)).toBe(true);
        const closed = !receiptOpen({ ...ledger, grants: {} }, entry.id);
        if (closed) expect(apply(ledger, entry)).toBe(ledger);
      }),
    );
  });

  it("merges commutatively, associatively and idempotently, and stays bounded", () => {
    checkProperty(
      fc.property(device, device, device, (a, b, c) => {
        const merged = mergeAchievementOutboxes(a, b);
        expect(plain(merged)).toEqual(plain(mergeAchievementOutboxes(b, a)));
        expect(plain(mergeAchievementOutboxes(merged, c))).toEqual(
          plain(mergeAchievementOutboxes(a, mergeAchievementOutboxes(b, c))),
        );
        expect(plain(mergeAchievementOutboxes(merged, merged))).toEqual(plain(merged));
        expect(dailyCount(merged).length).toBeLessThanOrEqual(MAX_DAILY_RECEIPTS);
        // What one device closed stays closed for both.
        for (const side of [a, b])
          if (side.dailyClosedThrough !== undefined)
            expect(merged.dailyClosedThrough).toBeGreaterThanOrEqual(side.dailyClosedThrough);
      }),
    );
  });

  it("keeps one copy of a receipt both devices hold, at the smaller amount", () => {
    checkProperty(
      fc.property(dailyClaim, fc.nat({ max: 50 }), (entry, other) => {
        const left = apply(achievementOutbox(undefined), entry);
        const right = apply(achievementOutbox(undefined), { ...entry, shards: other });
        const merged = mergeAchievementOutboxes(left, right);
        expect(Object.keys(merged.grants)).toEqual([entry.id]);
        expect(merged.grants[entry.id]?.shards).toBe(Math.min(entry.shards, other));
      }),
    );
  });

  it("validates what it writes: a saved outbox reads back unchanged", () => {
    checkProperty(
      fc.property(device, device, (a, b) => {
        const merged = mergeAchievementOutboxes(a, b);
        expect(plain(achievementOutbox(plain(merged)))).toEqual(plain(merged));
      }),
    );
  });

  it("closes the oldest day when a month of three dailies a day is passed, and keeps its shards", () => {
    const [first, second, third] = POOL;
    if (!first || !second || !third) throw new Error("daily pool too small");
    let ledger = achievementOutbox(undefined);
    for (let day = 0; day <= MAX_DAILY_RECEIPTS / 3; day += 1)
      for (const challenge of [first, second, third])
        ledger = apply(ledger, {
          id: dailyReceiptId(dailyDateKey(new Date(2026, 0, 1 + day)), challenge.id),
          coins: 0,
          shards: 10,
        });
    const firstDay = dailyReceiptId(dailyDateKey(new Date(2026, 0, 1)), first.id);
    expect(dailyCount(ledger)).toHaveLength(MAX_DAILY_RECEIPTS);
    expect(Object.hasOwn(ledger.grants, firstDay)).toBe(false);
    expect(outboxShards(ledger)).toBe(10 * (MAX_DAILY_RECEIPTS + 3));
    expect(receiptOpen(ledger, firstDay)).toBe(false);
    expect(receiptOpen(ledger, dailyReceiptId(dailyDateKey(new Date(2026, 0, 1)), POOL[5]?.id ?? ""))).toBe(false);
  });

  // The date key is unpadded, so as text "2026-10-1" sorts before "2026-7-19" and "2026-9-10" before "2026-9-5".
  // Folding and merging compare the parsed calendar day.
  describe("orders days by the calendar, not by the unpadded key's text", () => {
    const three = POOL.slice(0, 3);
    /** Three dailies a day for `days` days from `start`, each paying 10. */
    const claimDays = (start: Date, days: number, ledger = achievementOutbox(undefined)) => {
      for (let day = 0; day < days; day += 1) {
        const key = dailyDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + day));
        for (const challenge of three)
          ledger = apply(ledger, { id: dailyReceiptId(key, challenge.id), coins: 0, shards: 10 });
      }
      return ledger;
    };
    const keyed = (ledger: AchievementOutbox, key: string) =>
      dailyCount(ledger).filter((id) => id.startsWith(`daily:${key}:`));

    it("folds the oldest day when the kept days cross from single to double digits", () => {
      // 2026-9-5 through 2026-10-5: 31 days, so the oldest one, 2026-9-5, folds.
      const ledger = claimDays(new Date(2026, 8, 5), MAX_DAILY_RECEIPTS / 3 + 1);
      expect(keyed(ledger, "2026-9-5")).toHaveLength(0);
      for (const key of ["2026-9-6", "2026-9-9", "2026-9-10", "2026-9-30", "2026-10-1", "2026-10-5"])
        expect(keyed(ledger, key)).toHaveLength(3);
      expect(receiptOpen(ledger, dailyReceiptId("2026-9-5", POOL[5]?.id ?? ""))).toBe(false);
      expect(receiptOpen(ledger, dailyReceiptId("2026-10-1", POOL[5]?.id ?? ""))).toBe(true);
    });

    it("merges by the calendar: July folds before October, and the later closed day wins", () => {
      const october = claimDays(new Date(2026, 9, 1), MAX_DAILY_RECEIPTS / 3);
      const july = claimDays(new Date(2026, 6, 19), 1);
      for (const merged of [mergeAchievementOutboxes(october, july), mergeAchievementOutboxes(july, october)]) {
        expect(keyed(merged, "2026-7-19")).toHaveLength(0);
        expect(keyed(merged, "2026-10-1")).toHaveLength(3);
        expect(dailyCount(merged)).toHaveLength(MAX_DAILY_RECEIPTS);
      }
      // One side closed through 2026-7-9, the other through 2026-10-1: 2026-10-1 is later.
      const closedJuly = claimDays(new Date(2026, 6, 9), MAX_DAILY_RECEIPTS / 3 + 1);
      const closedOctober = claimDays(new Date(2026, 9, 1), MAX_DAILY_RECEIPTS / 3 + 1);
      const merged = mergeAchievementOutboxes(closedJuly, closedOctober);
      expect(merged.dailyClosedThrough).toBe(closedOctober.dailyClosedThrough);
      expect(receiptOpen(merged, dailyReceiptId("2026-10-1", POOL[5]?.id ?? ""))).toBe(false);
      // 2026-10-1 is closed; on 2026-10-2 a challenge nobody claimed is still open.
      expect(receiptOpen(merged, dailyReceiptId("2026-10-2", POOL[5]?.id ?? ""))).toBe(true);
    });
  });

  it("refuses malformed ids and dates that do not exist", () => {
    const empty = achievementOutbox(undefined);
    for (const id of ["daily:2026-2-30:d_kills", "daily:2026-07-19:d_kills", "daily:1969-12-31:d_kills", "bonus:x"])
      expect(receiptOpen(empty, id)).toBe(false);
    expect(() =>
      achievementOutbox({ ...empty, grants: { "daily:2026-13-1:d_kills": { coins: 0, shards: 1 } } }),
    ).toThrow();
  });

  it("bounds the daily receipts' saved size", () => {
    // The worst case: every kept receipt with the longest date key, the longest challenge id and the largest reward.
    const longestId = POOL.map((entry) => entry.id).reduce((left, right) =>
      right.length > left.length ? right : left,
    );
    const largest = Math.max(...POOL.map((entry) => entry.shards));
    const one = JSON.stringify({
      [dailyReceiptId("2026-12-31", longestId)]: { coins: 0, shards: largest, acknowledged: true },
    });
    // MAX_DAILY_RECEIPTS entries, comma-separated, inside one pair of braces.
    const size = (one.length - 1) * MAX_DAILY_RECEIPTS + 1;
    // Pinned: a change to the pool's ids or rewards, or to MAX_DAILY_RECEIPTS, updates this in the same pull request.
    expect(size).toBe(6_751);
  });
});
