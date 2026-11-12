import { projectTutorialGoldFrame } from "../../gameplay/training/tutorial-gold-reference";
import type { LiveTutorialRuntime } from "../../gameplay/training/live-tutorial-runtime";
import type { LiveGameHostState } from "../world/game-host-state";

/** Same post-commit source objects/IDs in live and detached hosts. No simulation or input synthesis. */
export function liveTutorialCoachFrame(tutorial: LiveTutorialRuntime, tick: number, state: Pick<LiveGameHostState, "player" | "blade" | "enemies" | "projectiles">,
  identity: { id(entity: object, role: "enemy" | "projectile"): string }, stage: number) {
  const session = tutorial.session(), player = state.player(), blade = state.blade();
  if ((!tutorial.active && !session.coach?.visible) || !player || !blade || session.annex || session.enemyPractice || session.bossPractice) return undefined;
  const saved = tutorial.captureSession();
  return projectTutorialGoldFrame({ tick, stage, encounter: saved && "fieldEncounter" in saved ? saved.fieldEncounter : "charger", player, blade,
    actors: state.enemies(), projectiles: state.projectiles(), id: (entity, role) => identity.id(entity, role) });
}
