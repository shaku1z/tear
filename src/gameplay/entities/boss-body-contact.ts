/**
 * What a boss's body does to a player who touches it. The rule: a boss body hurts only inside a declared
 * move. A boss on the shared move table declares one as a move whose hit shape is `body`
 * (boss-attacks.ts), so it has a tell, a damage number and lands once like any other strike; outside a
 * move its body blocks instead, pushing the player out to the side.
 *
 * The bosses built before the move table keep the contact they have always had. Each is a row here that
 * lists what its body is doing when touching it hurts, so the rule is written in one place for every boss.
 * `BOSS_BODY_CONTACT_OLD_ROWS` names every row whose body hurts outside a declared move. A boss leaves it
 * when it moves onto the move table. The one boss that may join it is a rebuild whose body is meant to hurt
 * (plans/active/VERDANT_PALE_REBUILD.md, decision D1: the new Rootbound); the test lists them
 * (tests/unit/boss-body-contact.test.ts).
 */

export interface BossBodyContactRow {
  /**
   * What the body is doing (see `bodyContactLabel` on the enemy base) when touching it hurts. "any" for a
   * body that always hurts, "never" for a boss whose body strikes are moves on the move table.
   */
  readonly hurtsIn: readonly string[] | "any" | "never";
  /** True when the body pushes the player out instead of letting them walk through it. */
  readonly blocks: boolean;
}

function row(hurtsIn: BossBodyContactRow["hurtsIn"], blocks: boolean): BossBodyContactRow {
  return Object.freeze({ hurtsIn: typeof hurtsIn === "string" ? hurtsIn : Object.freeze([...hurtsIn]), blocks });
}

export const BOSS_BODY_CONTACT = Object.freeze({
  // On the move table: no contact damage. The Rootbound has no body strike yet.
  rootbound: row("never", true),
  // Not rebuilt yet; its charge becomes a `body` hit when Pale is. It does not block until then.
  "white-hart": row("never", false),
  // Before the move table, kept exactly. The Warden's body hurts while it stands, walks and winds up, and
  // not during its staff strikes; Aldric's the same way around his cleaver moves.
  warden: row(["idle", "windup", "lungewind", "fakedeath"], false),
  aldric: row(
    [
      "idle",
      "windup",
      "recover",
      "charge",
      "chargewind",
      "overheadwind",
      "vaultwind",
      "ascendwind",
      "thronewind",
      "crownfire",
      "fallen",
    ],
    false,
  ),
  colossus: row("any", false),
  echo: row("any", false),
  // The Source labels its body by plane and breach: see `bodyContactLabel` in source-core.ts.
  source: row(["front", "breach-drift"], false),
  // The new Rootbound (plans/active/VERDANT_PALE_REBUILD.md, decision D1): its body hurts while it walks,
  // stands and winds up, like Aldric's. Under the floor and rising out of it, it is not there to touch.
  "rootbound-rebuild": row(
    ["idle", "walk", "swingwind", "throwwind", "sink", "uprootsink", "vaultwind", "swell"],
    false,
  ),
});

export type BossBodyContactId = keyof typeof BOSS_BODY_CONTACT;

/** The bosses whose body hurts outside a declared move: the old bosses, and the rebuilds D1 allows. */
export const BOSS_BODY_CONTACT_OLD_ROWS: readonly BossBodyContactId[] = Object.freeze(
  (Object.keys(BOSS_BODY_CONTACT) as BossBodyContactId[]).filter((id) => BOSS_BODY_CONTACT[id].hurtsIn !== "never"),
);

/** Whether touching a body hurts now, by its row and what it is doing. */
export function bossBodyHurts(contact: BossBodyContactRow, label: string | null): boolean {
  if (contact.hurtsIn === "any") return true;
  if (contact.hurtsIn === "never" || label === null) return false;
  return contact.hurtsIn.includes(label);
}

/** How fast a blocking body moves a player out of itself, in pixels per second. */
export const BOSS_BODY_PUSH_SPEED = 900;

type Box = Readonly<{ x: number; hw: number }>;

/**
 * Where a player overlapping a blocking body stands after one step of being pushed out. The player goes to
 * the nearer side of the body. A side with no room for the player between the body and the arena edge is
 * not a way out, so a player squeezed against a wall is moved through the body to the open side; with no
 * room on either side the player is left alone. Never returns a position outside the arena.
 */
export function pushOutOfBossBody(player: Box, body: Box, arenaWidth: number, maxStep: number): number {
  const reach = body.hw + player.hw;
  if (Math.abs(player.x - body.x) >= reach) return player.x;
  const left = body.x - reach;
  const right = body.x + reach;
  const leftFits = left >= player.hw;
  const rightFits = right <= arenaWidth - player.hw;
  if (!leftFits && !rightFits) return player.x;
  const nearerLeft = player.x < body.x || (player.x === body.x && leftFits);
  const goal = leftFits && (nearerLeft || !rightFits) ? left : right;
  const step = Math.max(-maxStep, Math.min(maxStep, goal - player.x));
  return player.x + step;
}
