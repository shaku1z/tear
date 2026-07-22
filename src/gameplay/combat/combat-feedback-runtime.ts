export interface CombatFeedbackEvent {
  readonly shake?: number; readonly flash?: number; readonly hitstop?: number; readonly slowmo?: number; readonly zoom?: number;
  readonly banner?: string; readonly txt?: string; readonly x?: number; readonly y?: number;
  readonly big?: boolean; readonly quiet?: boolean; readonly color?: string; readonly cue?: string;
}

export interface CombatFeedbackState { hitStop: number; slowMotion: number }

export interface CombatFeedbackPort {
  shake(amount: number): void; flash(amount: number): void; zoom(amount: number): void;
  banner(text: string, color: string): void; floater(x: number, y: number, text: string, big: boolean, color: string): void;
  sound(cue: string): void; slam(): void;
}

export function applyCombatFeedback(events: readonly CombatFeedbackEvent[], state: CombatFeedbackState,
  fallback: Readonly<{ x: number; y: number; color: string }>, port: CombatFeedbackPort, slamOnImpact = false): void {
  for (const event of events) {
    if (event.shake) port.shake(event.shake);
    if (event.flash) port.flash(event.flash);
    if (event.hitstop) state.hitStop = Math.max(state.hitStop, event.hitstop);
    if (event.slowmo) state.slowMotion = Math.max(state.slowMotion, event.slowmo);
    if (event.zoom) port.zoom(event.zoom);
    if (event.banner) port.banner(event.banner, event.color ?? fallback.color);
    if (event.txt) port.floater(event.x ?? fallback.x, event.y ?? fallback.y, event.txt, event.big === true, event.color ?? fallback.color);
    if (event.cue) port.sound(event.cue);
    if (slamOnImpact && (event.big === true || (event.shake ?? 0) >= 9) && event.quiet !== true) port.slam();
  }
}
