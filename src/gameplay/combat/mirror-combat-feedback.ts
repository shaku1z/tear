/**
 * The Mirror's per-tick combat read.
 *
 * The Echo watches how the player fights and answers it, so this advance is
 * simulation, not feedback: skipping it leaves the boss inert. Only the
 * shatter floater and the queued effect flush around it are presentation.
 *
 * Every host that fights the Echo — live, detached, replay, headless — must
 * run this, which is why it lives here rather than inside the live adapter.
 */
export interface MirrorCombatPort<Player, Blade> {
  active: boolean;
  readonly host?: { readonly dead?: boolean } | null;
  updateCombat(seconds: number, player: Player, blade: Blade): void;
}

/** Advances the Mirror and reports whether the reflection just shattered. */
export function updateMirrorCombat<Player, Blade>(
  mirror: MirrorCombatPort<Player, Blade>,
  seconds: number,
  player: Player,
  blade: Blade,
): boolean {
  if (!mirror.active) return false;
  mirror.updateCombat(seconds, player, blade);
  if (mirror.host?.dead !== true) return false;
  mirror.active = false;
  return true;
}
