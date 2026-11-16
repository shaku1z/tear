import { len } from "../domain/geometry";
import type { UpgradeApplyContext, UpgradeEventHandler, UpgradeMods } from "./upgrades";

type HookContext = Pick<UpgradeApplyContext, "mods" | "config">;
export type UpgradeHookName = {
  [K in keyof UpgradeMods]-?: UpgradeMods[K] extends UpgradeEventHandler[] ? K : never;
}[keyof UpgradeMods];
type Binding = Readonly<{ hook: UpgradeHookName; create: (context: HookContext) => UpgradeEventHandler }>;
const hookNames: readonly UpgradeHookName[] = [
  "onHit",
  "onSwingHit",
  "onKill",
  "onParry",
  "onPerfectParry",
  "onSlam",
  "onDashStart",
  "onDashContact",
  "onThrowLaunch",
  "onThrowResolve",
  "onThrowSecondary",
  "onReturnHit",
  "onWeaponCatch",
  "onEnemyFirstDamaged",
  "onEnemyDeath",
  "onSkillKill",
  "onReflectedHit",
];

// These factories only bind behavior. Acquiring/tiering an upgrade remains the
// sole owner of stat changes; restoring a binding must never replay those changes.
const bindings = {
  bloodrite: {
    hook: "onKill",
    create:
      ({ mods, config }) =>
      (ev) => {
        if (ev.cause === "skill") {
          ev.player.heal(config.resilience.bloodriteHeal);
          if (mods.bloodGuard) ev.player.guardT = Math.max(ev.player.guardT, 1.0);
        } else if (mods.killHeal) ev.player.heal(mods.killHeal);
      },
  },
  "riposte:2": {
    hook: "onParry",
    create: () => (ev) => {
      ev.player.heal(6);
    },
  },
  seismic_slam: {
    hook: "onSlam",
    create:
      ({ config }) =>
      (ev) => {
        ev.dealAoE(ev.x, ev.y, 130, 22);
        ev.fx.explode(ev.x, ev.y, config.colors.slam, 0.9);
      },
  },
  detonate: {
    hook: "onKill",
    create:
      ({ config }) =>
      (ev) => {
        ev.dealAoE(ev.x, ev.y, 120, 18);
        ev.fx.explode(ev.x, ev.y, config.colors.bomber, 0.7);
      },
  },
  adrenaline: {
    hook: "onKill",
    create: () => (ev) => {
      ev.player.dashCd = 0;
    },
  },
  rupture: {
    hook: "onHit",
    create:
      ({ mods }) =>
      (ev) => {
        if (mods.bleedHit && ev.enemy?.applyBleed) ev.enemy.applyBleed(mods.bleedHit);
      },
  },
  sunder: {
    hook: "onHit",
    create:
      ({ mods }) =>
      (ev) => {
        const e = ev.enemy;
        if (!mods.sunderHit || !e?.applyMark) return;
        if (mods.sunderSpread && e.markT > 0)
          for (const o of ev.enemies) {
            if (o !== e && !o.dead && o.applyMark && len(o.x - e.x, o.y - e.y) < 150) o.applyMark();
          }
        e.applyMark();
        if (mods.sunderShatter && e.cfg?.breakSpeed && !e.enraged) {
          e.enraged = true;
          e.stun = Math.max(e.stun, 0.5);
        }
      },
  },
  "stormbank:charge": {
    hook: "onSkillKill",
    create:
      ({ mods, config }) =>
      () => {
        const chargeCap = config.stormbank.maxCharges[mods.stormbank - 1] ?? 0;
        mods.stormCharges = Math.min(chargeCap, mods.stormCharges + 1);
      },
  },
  "stormbank:resolve": {
    hook: "onThrowResolve",
    create:
      ({ mods }) =>
      (ev) => {
        if (ev.dischargeStormbank) ev.dischargeStormbank(mods);
      },
  },
  overrun: {
    hook: "onEnemyDeath",
    create:
      ({ mods }) =>
      (ev) => {
        if (ev.cleanElimination && ev.addOverrunStack) ev.addOverrunStack(mods);
      },
  },
  "sever:parry": {
    hook: "onPerfectParry",
    create:
      ({ mods }) =>
      (ev) => {
        if (ev.applySever && ev.sourceEnemy) ev.applySever(ev.sourceEnemy, mods.sever);
      },
  },
  "sever:reflected": {
    hook: "onReflectedHit",
    create:
      ({ mods }) =>
      (ev) => {
        if (mods.sever >= 2 && ev.applySever && ev.enemy) ev.applySever(ev.enemy, 1);
      },
  },
  tempo: {
    hook: "onParry",
    create:
      ({ mods }) =>
      (ev) => {
        const p = ev.player;
        p.tempoStk = Math.min(mods.tempoMax, (p.tempoT > 0 ? p.tempoStk : 0) + 1);
        p.tempoT = 4;
        p.dashCd = 0;
        p.dashCharges = p.maxDashCharges;
      },
  },
  backlash: {
    hook: "onParry",
    create:
      ({ mods, config }) =>
      (ev) => {
        if (!mods.backlash) return;
        const r = mods.backlashSurge ? 250 : 175;
        ev.dealAoE(ev.x, ev.y, r, mods.backlash);
        for (const e of ev.enemies) {
          if (!e.dead && len(e.x - ev.x, e.y - ev.y) < r) {
            if (!e.isBoss) e.stun = Math.max(e.stun, mods.backlashSurge ? 1.1 : 0.55);
            if (mods.backlashMark && e.applyMark) e.applyMark();
          }
        }
        ev.fx.ring(ev.x, ev.y, mods.backlashSurge ? 16 : 11, config.colors.perfect);
        if (mods.backlashSurge) ev.player.iframe = Math.max(ev.player.iframe, 1.0);
      },
  },
} satisfies Record<string, Binding>;

export type UpgradeHookId = keyof typeof bindings;
/** Every upgrade hook and the callback list it joins, for checks that must cover them all. */
export const UPGRADE_HOOK_BINDINGS: readonly Readonly<{ id: UpgradeHookId; hook: UpgradeHookName }>[] = Object.freeze(
  (Object.keys(bindings) as UpgradeHookId[]).map((id) => Object.freeze({ id, hook: bindings[id].hook })),
);
const identities = new WeakMap<UpgradeEventHandler, UpgradeHookId>();

export function upgradeHookIdentity(handler: UpgradeEventHandler): UpgradeHookId | undefined {
  return identities.get(handler);
}

export function bindUpgradeHook(id: UpgradeHookId, context: HookContext): void {
  const binding = bindings[id];
  const handler = binding.create(context);
  identities.set(handler, id);
  context.mods[binding.hook].push(handler);
}

export function restoreUpgradeHooks(context: HookContext): void {
  // Validate the complete replacement before changing any callback array.
  const replacements: (readonly [UpgradeHookName, UpgradeEventHandler[]])[] = [];
  for (const key of hookNames) {
    const value = context.mods[key];
    if (!Array.isArray(value)) throw new TypeError(`Upgrade hook array ${key} is required`);
    const handlers = value.map((entry: unknown) => {
      if (entry === null)
        throw new TypeError(
          `Legacy upgrade callback payload in ${key} is unsupported: snapshot discarded its binding identity`,
        );
      if (
        typeof entry !== "object" ||
        !("$upgradeHook" in entry) ||
        typeof entry.$upgradeHook !== "string" ||
        !Object.hasOwn(bindings, entry.$upgradeHook)
      ) {
        throw new TypeError(`Unrecoverable upgrade hook in ${key}; a canonical binding identifier is required`);
      }
      const id = entry.$upgradeHook as UpgradeHookId;
      const binding = bindings[id];
      if (binding.hook !== key) throw new TypeError(`Upgrade hook ${id} does not belong to ${key}`);
      const handler = binding.create(context);
      identities.set(handler, id);
      return handler;
    });
    replacements.push([key, handlers]);
  }
  for (const [key, handlers] of replacements) context.mods[key] = handlers;
}
