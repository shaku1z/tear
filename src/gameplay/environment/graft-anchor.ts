import type { EnvironmentObjectKind } from "./environment-contracts";

export const GRAFT_ANCHOR_TYPES = Object.freeze(["bastion", "mercy", "haste"] as const);
export type GraftAnchorType = typeof GRAFT_ANCHOR_TYPES[number];

export const MAX_ACTIVE_GRAFT_ANCHORS = 3;
export const GRAFT_WARNING_FLOOR_SECONDS = 0.55;

interface GraftAnchorDefinitionBase {
  readonly kind: Extract<EnvironmentObjectKind, "graft-anchor">;
  readonly factoryId: "graft-anchor";
  readonly procPolicyId: "boss-combat-object";
  readonly graftType: GraftAnchorType;
  readonly playerQuestion: string;
}

export interface BastionGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "bastion";
  readonly effect: "incoming-damage-multiplier";
  /** Applied to otherwise legal boss damage. It must remain above zero. */
  readonly incomingDamageMultiplier: number;
}

export interface MercyGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "mercy";
  readonly effect: "bounded-pulse-recovery";
  readonly pulseIntervalSeconds: number;
  readonly pulseHealthFraction: number;
  readonly maxRecoveryHealthFraction: number;
}

export interface HasteGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "haste";
  readonly effect: "selected-attack-cadence-multiplier";
  readonly cadenceMultiplier: number;
  readonly minimumWarningSeconds: number;
}

export type GraftAnchorDefinition = BastionGraftDefinition | MercyGraftDefinition | HasteGraftDefinition;

const BASTION_GRAFT = Object.freeze({
  kind: "graft-anchor",
  factoryId: "graft-anchor",
  procPolicyId: "boss-combat-object",
  graftType: "bastion",
  playerQuestion: "Break the Graft for full damage, or keep pressuring Rootbound through its protection?",
  effect: "incoming-damage-multiplier",
  incomingDamageMultiplier: 0.8,
} satisfies BastionGraftDefinition);

const MERCY_GRAFT = Object.freeze({
  kind: "graft-anchor",
  factoryId: "graft-anchor",
  procPolicyId: "boss-combat-object",
  graftType: "mercy",
  playerQuestion: "Break the Graft before its bounded recovery budget is spent?",
  effect: "bounded-pulse-recovery",
  pulseIntervalSeconds: 2.4,
  pulseHealthFraction: 0.015,
  maxRecoveryHealthFraction: 0.09,
} satisfies MercyGraftDefinition);

const HASTE_GRAFT = Object.freeze({
  kind: "graft-anchor",
  factoryId: "graft-anchor",
  procPolicyId: "boss-combat-object",
  graftType: "haste",
  playerQuestion: "Break the Graft to restore the normal attack rhythm?",
  effect: "selected-attack-cadence-multiplier",
  cadenceMultiplier: 1.15,
  minimumWarningSeconds: GRAFT_WARNING_FLOOR_SECONDS,
} satisfies HasteGraftDefinition);

/**
 * Rootbound-specific tuning for the existing `graft-anchor` environment kind.
 * This is not an environment-kind or placement registry; production ownership
 * and construction remain with the canonical environment runtime.
 */
export const GRAFT_ANCHOR_DEFINITIONS: readonly GraftAnchorDefinition[] = Object.freeze([
  BASTION_GRAFT,
  MERCY_GRAFT,
  HASTE_GRAFT,
]);

export function graftAnchorDefinition(graftType: GraftAnchorType): GraftAnchorDefinition {
  const definition = GRAFT_ANCHOR_DEFINITIONS.find((candidate) => candidate.graftType === graftType);
  if (definition === undefined) throw new RangeError(`unknown Graft Anchor type: ${graftType}`);
  return definition;
}
