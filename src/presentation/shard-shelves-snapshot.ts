/**
 * The SHARDS tab of the Shop as plain data: one shelf per cosmetic slot that has items, the game's own
 * look first, then each item with what the player can do with it. Pure: the app passes the catalog, the
 * saved state and the profile facts in; the renderer turns each card into one control.
 */
import { activeLoadout, itemStatus, priceOf, shardBalance, shardsEarned, type ItemStatus } from "../domain/cosmetics";
import type {
  CosmeticCatalog,
  CosmeticItem,
  CosmeticSlot,
  CosmeticState,
  Look,
  ParamSpec,
} from "../domain/cosmetic-types";
import {
  conditionMet,
  conditionText,
  type ConditionNames,
  type ProgressFacts,
  type UnlockCondition,
} from "../domain/unlock-condition";
import type { ShardCardView, ShardShelfView, ShardSwatchView, ShardsView } from "./screens/contracts";

export interface ShardShelvesInput {
  readonly catalog: CosmeticCatalog;
  readonly state: CosmeticState;
  /** Shards earned over time (the profile's `shards`); the balance is derived from it. */
  readonly earned: number;
  readonly facts: ProgressFacts;
  readonly names: ConditionNames;
  /** Names of collections by id, for "complete the ... collection". */
  readonly collectionName: (id: string) => string;
}

/** The colours and text a look is made of, read from the family's own parameter list: no per-family code. */
export function lookSwatch(look: Look, params: Readonly<Record<string, ParamSpec>>): ShardSwatchView {
  const colors: string[] = [];
  let text: string | undefined;
  for (const [key, spec] of Object.entries(params)) {
    const value = look[key];
    if (spec.type === "color" && typeof value === "string") colors.push(value);
    if (spec.type === "colors" && Array.isArray(value))
      colors.push(...value.filter((entry): entry is string => typeof entry === "string"));
    if (spec.type === "text" && typeof value === "string") text = value;
  }
  return text === undefined ? { colors } : { colors, text };
}

function acquireNote(item: CosmeticItem, input: ShardShelvesInput): string {
  const how = item.acquire.find((entry) => entry.how !== "shards");
  if (!how) return "";
  switch (how.how) {
    case "achievement":
      return `Unlock ${input.names.achievement(how.id)}`;
    case "boss":
      return `Defeat ${input.names.boss(how.id)}`;
    case "collection":
      return `Complete the ${input.collectionName(how.id)} collection`;
    default:
      return "Not available yet";
  }
}

function noteFor(item: CosmeticItem, status: ItemStatus, input: ShardShelvesInput): string {
  if (status !== "locked" && status !== "elsewhere") return "";
  const collection = input.catalog.collections.find((entry) => entry.id === item.collection);
  const needs = [collection?.unlock, item.unlock]
    .filter((condition): condition is UnlockCondition => condition !== undefined)
    .filter((condition) => !conditionMet(condition, input.facts))
    .map((condition) => conditionText(condition, input.names))
    .filter((text) => text !== "");
  return needs[0] ?? acquireNote(item, input);
}

function itemCard(
  item: CosmeticItem,
  slot: CosmeticSlot,
  input: ShardShelvesInput,
  balance: number,
  params: Readonly<Record<string, ParamSpec>>,
): ShardCardView {
  const status = itemStatus(input.catalog, input.state, item, input.facts);
  const price = priceOf(input.catalog, item);
  const forSale = item.acquire.some((entry) => entry.how === "shards") && !isHeld(status);
  return {
    id: item.id,
    slot: slot.id,
    label: item.name,
    tier: item.tier.toUpperCase(),
    state: status,
    ...(forSale ? { price } : {}),
    affordable: status === "available" && balance >= price,
    note: noteFor(item, status, input),
    isNew: isHeld(status) && input.state.seen[item.id] === undefined,
    swatch: lookSwatch(item.look, params),
  };
}

/** Whether the player holds the item. */
const isHeld = (status: ItemStatus): boolean => status === "owned" || status === "equipped";

export function buildShardShelves(input: ShardShelvesInput): ShardsView {
  const { catalog } = input;
  const balance = shardBalance(input.earned, input.state);
  const equipped = activeLoadout(input.state)?.slots ?? {};
  const shelves: ShardShelfView[] = [];
  for (const slot of catalog.slots) {
    const items = catalog.items.filter((item) => item.slot === slot.id);
    if (items.length === 0) continue;
    const params = catalog.families.find((family) => family.id === slot.family)?.params ?? {};
    const wearing = equipped[slot.id]?.id;
    const wearingOwned = wearing !== undefined && wearing !== null && input.state.owned[wearing] !== undefined;
    const defaultCard: ShardCardView = {
      id: null,
      slot: slot.id,
      label: "DEFAULT",
      tier: "",
      state: wearingOwned ? "owned" : "equipped",
      affordable: false,
      note: "",
      isNew: false,
      swatch: lookSwatch(slot.default, params),
    };
    shelves.push({
      slot: slot.id,
      label: slot.label,
      hookReady: slot.hook === "ready",
      cards: [defaultCard, ...items.map((item) => itemCard(item, slot, input, balance, params))],
    });
  }
  return { balance, earned: shardsEarned(input.earned), shelves };
}
