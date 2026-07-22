import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { AFFIXES, applyAffix, type AffixEnemy } from "../../src/gameplay/affixes";
import type { EnemyKind } from "../../src/gameplay/run/content-director";
import { STAGES } from "../../src/gameplay/stages";
import { VARIANTS, applyVariant } from "../../src/gameplay/variants";
import {
  STANDARD_ACTOR_FACTORIES, behaviorSnapshot, createEnemyHarness, createStandardActor, updateActor,
} from "./enemy-test-harness";

function keysOf<T extends object>(record: T): (keyof T)[] {
  return Object.keys(record) as (keyof T)[];
}

const PUBLISHED_KINDS = keysOf(STANDARD_ACTOR_FACTORIES).sort();
const VARIANT_KINDS: readonly EnemyKind[] = ["charger", "ranged", "flyer", "bomber"];

describe("enemy behavior preservation matrix", () => {
  it("constructs and deterministically updates every enemy family published by the stage catalogue", () => {
    const stageKinds = [...new Set(STAGES.flatMap((stage) => stage.pool.map(([kind]) => kind)))].sort();
    expect(stageKinds).toEqual(PUBLISHED_KINDS);
    for (const kind of PUBLISHED_KINDS) {
      const left = createEnemyHarness([0.2, 0.7, 0.4]);
      const right = createEnemyHarness([0.2, 0.7, 0.4]);
      const a = createStandardActor(kind, left.types);
      const b = createStandardActor(kind, right.types);
      const shotsA: InstanceType<typeof left.Projectile>[] = [];
      const shotsB: InstanceType<typeof right.Projectile>[] = [];

      updateActor(a, 180, left.platforms, left.player, shotsA);
      updateActor(b, 180, right.platforms, right.player, shotsB);

      expect(behaviorSnapshot(a, shotsA), kind).toEqual(behaviorSnapshot(b, shotsB));
      expect(Number.isFinite(a.x) && Number.isFinite(a.y), kind).toBe(true);
      expect(a.aliveT, kind).toBeCloseTo(3, 8);
      if (kind === "priest" || kind === "mender" || kind === "herald" || kind === "anchor") {
        expect(a.supportType, kind).toBe(kind);
      }
    }
  });

  it("executes every canonical variant branch deterministically with every legal affix", () => {
    for (const kind of VARIANT_KINDS) {
      const variants = VARIANTS[kind];
      if (!variants) throw new Error(`Variant family ${kind} has no canonical catalogue`);
      for (const variant of variants) {
        for (const affix of AFFIXES) {
          const probe = createStandardActor(kind, createEnemyHarness().types) as unknown as AffixEnemy;
          if (!affix.appliesTo(probe)) continue;
          const left = createEnemyHarness([0.15, 0.65, 0.35]);
          const right = createEnemyHarness([0.15, 0.65, 0.35]);
          const a = createStandardActor(kind, left.types);
          const b = createStandardActor(kind, right.types);
          applyVariant(a, variant);
          applyVariant(b, variant);
          expect(applyAffix(a as unknown as AffixEnemy, affix.id), `${kind}/${variant.id}/${affix.id}`).toBe(true);
          expect(applyAffix(b as unknown as AffixEnemy, affix.id), `${kind}/${variant.id}/${affix.id}`).toBe(true);
          expect(applyAffix(a as unknown as AffixEnemy, affix.id), "duplicate affix").toBe(false);

          const shotsA: InstanceType<typeof left.Projectile>[] = [];
          const shotsB: InstanceType<typeof right.Projectile>[] = [];
          updateActor(a, 240, left.platforms, left.player, shotsA);
          updateActor(b, 240, right.platforms, right.player, shotsB);

          expect(a.variant, kind).toBe(variant.id);
          expect(a.behavior, variant.id).not.toBe("");
          expect(behaviorSnapshot(a, shotsA), `${kind}/${variant.id}/${affix.id}`).toEqual(behaviorSnapshot(b, shotsB));
          expect(Math.abs(a.x - 360) > 0.01 || Math.abs(a.y - (kind === "flyer" || kind === "bomber" ? 300 : a.y)) > 0.01 || shotsA.length > 0 || a.atk !== "idle", `${kind}/${variant.id} did not act`).toBe(true);
          expect(a.applyBreak(CONFIG.weapons.hammer.breakThreshold * 2), `${kind}/${variant.id}/${affix.id} break`).toBe(true);
          a.applySever(2);
          expect(a.severTier, `${kind}/${variant.id}/${affix.id} sever`).toBe(2);
          a.hit(a.maxHp + a.shield + 10_000, 1, 0);
          expect(a.dead, `${kind}/${variant.id}/${affix.id} death`).toBe(true);
          expect([a].filter((enemy) => !enemy.dead), `${kind}/${variant.id}/${affix.id} cleanup`).toEqual([]);
        }
      }
    }
  });

  it("enforces affix incompatibilities and applies each accepted mutation behaviorally", () => {
    for (const kind of PUBLISHED_KINDS) {
      for (const affix of AFFIXES) {
        const actor = createStandardActor(kind, createEnemyHarness().types);
        const target = actor as unknown as AffixEnemy;
        const before = {
          hp: actor.hp, weight: actor.weight, speedMult: actor.speedMult, fireRateMult: actor.fireRateMult,
          volley: actor.volley, contactReach: actor.contactReach, contactDmg: actor.contactDmg,
          hw: actor.hw, shield: actor.shield,
        };
        const accepted = applyAffix(target, affix.id);
        expect(accepted, `${kind}/${affix.id}`).toBe(affix.appliesTo(target));
        if (accepted) expect({
          hp: actor.hp, weight: actor.weight, speedMult: actor.speedMult, fireRateMult: actor.fireRateMult,
          volley: actor.volley, contactReach: actor.contactReach, contactDmg: actor.contactDmg,
          hw: actor.hw, shield: actor.shield,
        }, `${kind}/${affix.id}`).not.toEqual(before);
      }
    }
    expect(applyAffix(createStandardActor("armored", createEnemyHarness().types) as unknown as AffixEnemy, "swift")).toBe(false);
    for (const id of ["rapid", "volley"]) {
      expect(applyAffix(createStandardActor("charger", createEnemyHarness().types) as unknown as AffixEnemy, id)).toBe(false);
    }
    expect(applyAffix(createStandardActor("ranged", createEnemyHarness().types) as unknown as AffixEnemy, "armed")).toBe(false);
  });

  it("preserves damage, shield, break, sever expiry, death and collection cleanup for every family", () => {
    for (const kind of PUBLISHED_KINDS) {
      const actor = createStandardActor(kind, createEnemyHarness().types);
      expect(actor.applyBreak(CONFIG.weapons.hammer.breakThreshold * 2), `${kind} break`).toBe(true);
      expect(actor.stun, `${kind} stun`).toBeGreaterThan(0);
      actor.applySever(3);
      expect(actor.severTier, `${kind} sever`).toBe(3);
      expect(actor.outgoingDamageMult(), `${kind} sever multiplier`).toBeLessThan(1);
      actor.tickTimers(CONFIG.sever.normalDuration + 1);
      expect(actor).toMatchObject({ severTier: 0, severT: 0, severMult: 1 });

      const affixTarget = actor as unknown as AffixEnemy;
      expect(applyAffix(affixTarget, "warded")).toBe(true);
      const hpBeforeShield = actor.hp;
      actor.hit(Math.max(1, actor.shield / 2), 1, 0);
      expect(actor.hp, `${kind} shield ownership`).toBe(hpBeforeShield);
      actor.hit(actor.maxHp + actor.shield + 10_000, 1, 0);
      expect(actor.dead, `${kind} death`).toBe(true);
      expect([actor].filter((enemy) => !enemy.dead), `${kind} cleanup`).toEqual([]);
      expect(actor.hit(10, 1, 0), `${kind} post-death damage`).toBe(0);
    }
  });
});
