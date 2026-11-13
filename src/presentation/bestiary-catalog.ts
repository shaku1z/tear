import {
  BOSS_ROSTER,
  PUBLISHED_ENEMY_IDENTITY_IDS,
  type BossId,
  type EnemyKind,
} from "../gameplay/run/content-director";
import { PUBLISHED_STAGE_IDS, STAGE_BOSS_HOME, STAGE_DISPLAY_NAMES, type StageId } from "../gameplay/stages";
import { VARIANTS, variantIdsAvailableOn } from "../gameplay/variants";

/**
 * Codex bestiary, derived from the source-owned catalogs instead of a hand-kept list:
 * - which enemies and bosses appear: the published enemy identities and BOSS_ROSTER
 *   (so preview content such as the Pale Traverse and its White Hart stays out);
 * - boss names and their stage line: boss definitions + stage publication order;
 * - variant names: the variant catalog filtered to published variants.
 * Only player-facing copy (role, category, counterplay) lives here, keyed by the
 * canonical ids; the Record types make a new enemy or boss fail to compile until
 * its copy is written.
 */
export type BestiaryCategory = "melee" | "ranged" | "air" | "support";
interface EnemyCopy {
  readonly name: string;
  readonly role: string;
  readonly category: BestiaryCategory;
  readonly desc: string;
}

export const ENEMY_BESTIARY_COPY: Readonly<Record<EnemyKind, EnemyCopy>> = Object.freeze({
  charger: {
    name: "Charger",
    role: "MELEE RUSHER",
    category: "melee",
    desc: "Closes the gap and commits a telegraphed bull-charge. Bait the lunge into a wall — a whiff leaves it stunned and wide open.",
  },
  ranged: {
    name: "Shooter",
    role: "KITING RANGED",
    category: "ranged",
    desc: "Holds its distance, winds up a telegraphed shot, then kites away. Swing FAST through the shot to parry it back at them.",
  },
  flyer: {
    name: "Flyer",
    role: "AERIAL SWOOPER",
    category: "air",
    desc: "Hovers out of reach, then dives along an arc. Launch it or meet it with an up-swing to knock it out of the sky.",
  },
  bomber: {
    name: "Bomber",
    role: "ARCING ARTILLERY",
    category: "ranged",
    desc: "Lobs deflectable bombs from a standoff. Parry one back to detonate it in their face. Variants plant mines, mud, or walls.",
  },
  armored: {
    name: "Armored",
    role: "SHIELDED TANK",
    category: "melee",
    desc: "Plated on the side it faces; shrugs off ground hits. Launch it airborne to strip the guard, then punish — it enrages on break.",
  },
  priest: {
    name: "Priest",
    role: "SUPPORT · SHIELDS",
    category: "support",
    desc: "Hangs back and shields nearby allies. Cut the link beam, or rush the priest itself, to drop their protection.",
  },
  mender: {
    name: "Mender",
    role: "SUPPORT · HEALS",
    category: "support",
    desc: "Steadily heals the most wounded ally. Kill it first, or your damage just gets undone.",
  },
  herald: {
    name: "Herald",
    role: "SUPPORT · EMPOWERS",
    category: "support",
    desc: "Hastes and empowers the pack around it. The whole wave hits harder and faster while it lives.",
  },
  anchor: {
    name: "Anchor",
    role: "SUPPORT · ROOTS",
    category: "support",
    desc: "Fragile, but snares you in place from range. Break its line to you, or kill it fast before the root lands.",
  },
  wraith: {
    name: "Wraith",
    role: "PHASING STALKER",
    category: "air",
    desc: "Shrugs off direct blade hits. Only a thrown blade or a deflected shot can kill it — play the whole arena.",
  },
  chimera: {
    name: "Chimera",
    role: "ADAPTIVE MIMIC",
    category: "melee",
    desc: "Adopts the attacks of whatever enemy types share its wave — it might charge, shoot, or bomb you. No two are alike.",
  },
  rootbinder: {
    name: "Rootbinder",
    role: "VERDANT · BINDER",
    category: "support",
    desc: "Plants itself, then throws root links to you or its allies. Cut the warned link line to snap it, or strike while it is rooted.",
  },
  rimehound: {
    name: "Rimehound",
    role: "PALE · HUNTER",
    category: "melee",
    desc: "Runs the frozen tracks in packs and cuts across your line of travel. Break its stride before it closes.",
  },
});

export const BOSS_BESTIARY_COPY: Readonly<Record<BossId, string>> = Object.freeze({
  warden:
    "Keeper of order. Slams shockwaves across the floor, paints prohibited red zones, and in its final phase dives from the ceiling.",
  colossus:
    "A containment engine. Front-shielded — strike from the air. Hurls a bouncing sweeper, heats floor panels, then charges you down.",
  aldric:
    "Aldric. A pure duel that becomes a throne of fire — then a fake death, a frenzy, and summoned adds. He cannot die during the fall.",
  rootbound:
    "Keeper of the last mercy. Grows grafts that mend its wounds and roots the arena — sever the grafts so your damage stays dealt.",
  "white-hart":
    "A pale guide that never arrives. Leads you along returning roads and strikes from the tracks it leaves behind.",
  echo: "You. Mirrors your last trick on a delay; repeat yourself and it anticipates. Splits in two, then vanishes in a blinding white-out.",
  source:
    "The tear itself. Withdraws behind the route, manifests attacks on your plane, then breaches forward — that breach is your window.",
});

export interface BestiaryEntry {
  /** Stable id: the canonical enemy kind or boss id. */
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly desc: string;
  readonly category: BestiaryCategory | "boss";
  readonly variants?: string;
  readonly boss?: true;
  readonly bossId?: BossId;
  readonly enemyKind?: EnemyKind;
}

function publishedVariantNames(kind: EnemyKind): string | undefined {
  const published = new Set(variantIdsAvailableOn("published"));
  const catalog = (VARIANTS as Readonly<Partial<Record<string, readonly Readonly<{ id: string; name: string }>[]>>>)[
    kind
  ];
  if (catalog === undefined) return undefined;
  // The first variant is the family's base form (it shares the family name).
  const names = catalog
    .slice(1)
    .filter((variant) => published.has(variant.id))
    .map((variant) => variant.name);
  return names.length > 0 ? names.join(" · ") : undefined;
}

function bossStageLine(bossId: BossId): string {
  const stage = (Object.entries(STAGE_BOSS_HOME) as [StageId, BossId][]).find(([, boss]) => boss === bossId)?.[0];
  const index = stage === undefined ? -1 : PUBLISHED_STAGE_IDS.indexOf(stage);
  if (stage === undefined || index < 0) return "BOSS";
  return `STAGE ${String(index + 1)} · ${STAGE_DISPLAY_NAMES[stage].replace(/^The /u, "").toUpperCase()}`;
}

/** Published bestiary entries in canonical order: enemy identities, then bosses in stage order. */
export function publishedBestiaryEntries(): readonly BestiaryEntry[] {
  const enemies = PUBLISHED_ENEMY_IDENTITY_IDS.map((kind): BestiaryEntry => {
    const copy = ENEMY_BESTIARY_COPY[kind],
      variants = publishedVariantNames(kind);
    return Object.freeze({
      id: kind,
      name: copy.name,
      role: copy.role,
      desc: copy.desc,
      category: copy.category,
      enemyKind: kind,
      ...(variants === undefined ? {} : { variants }),
    });
  });
  const stageOrder = (id: BossId): number => {
    const stage = (Object.entries(STAGE_BOSS_HOME) as [StageId, BossId][]).find(([, boss]) => boss === id)?.[0];
    const index = stage === undefined ? -1 : PUBLISHED_STAGE_IDS.indexOf(stage);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const bosses = [...BOSS_ROSTER]
    .sort((left, right) => stageOrder(left.id) - stageOrder(right.id))
    .map((boss): BestiaryEntry =>
      Object.freeze({
        id: boss.id,
        name: boss.name,
        role: bossStageLine(boss.id),
        desc: BOSS_BESTIARY_COPY[boss.id],
        category: "boss",
        boss: true,
        bossId: boss.id,
      }),
    );
  return Object.freeze([...enemies, ...bosses]);
}
