import { handleReplayTransport } from "./replay-transport-controller";
import { createGhostFinalePlayback } from "../ghost/finale-playback";
import type { GhostFinalePermit } from "../ghost/finale-companion";
import type { GhostReadCapsule } from "../ghost/capsule-reader";
import type { GhostTheaterScreenServices } from "./ghost-theater-screen-adapter";
import type { LegacyAppScreen } from "./legacy-state-controller";

/** Source-time transport uses recorded frames, including multiple positions at the same canonical tick. */
export function createGhostFinaleScreenAdapter(services: GhostTheaterScreenServices) {
  let active: { source: ReturnType<typeof createGhostFinalePlayback>; index: number; elapsed: number;
    playing: boolean; speed: number; info: boolean; from: LegacyAppScreen; notice?: string } | undefined;
  const seek = (index: number) => { if (active === undefined) return; active.index = Math.max(0, Math.min(active.source.positions.length - 1, Math.floor(index))); active.elapsed = active.source.positions[active.index]?.seconds ?? 0; };
  const seekSeconds = (target: number) => {
    if (active === undefined) return;
    const index = active.source.positions.findIndex((position) => position.seconds >= target);
    seek(index < 0 ? active.source.positions.length - 1 : index);
  };
  return Object.freeze({
    open(capsule: GhostReadCapsule, permit: GhostFinalePermit, from: LegacyAppScreen) {
      const source = createGhostFinalePlayback(capsule, permit, services.presentation);
      active = { source, from, index: 0, elapsed: 0, playing: false, speed: 1, info: false };
    },
    parentId: () => active?.source.parentId,
    notice(message: string) { if (active !== undefined) active.notice = message; },
    exit() { const from = active?.from; active = undefined; return from; },
    render() {
      if (active === undefined) return;
      const state = active, last = state.source.positions.at(-1), duration = last?.seconds ?? 0;
      if (state.playing) {
        state.elapsed = Math.min(duration, state.elapsed + Math.max(0, services.deltaSeconds()) * state.speed);
        while (state.index + 1 < state.source.positions.length && (state.source.positions[state.index + 1]?.seconds ?? Infinity) <= state.elapsed) state.index++;
        if (state.index === state.source.positions.length - 1) state.playing = false;
      }
      const native = services.nativeTransport?.();
      if (native !== undefined) handleReplayTransport({ ...native, currentTime: state.elapsed, duration, seek: seekSeconds,
        toggle: () => { state.playing = !state.playing; } });
      const selected = state.source.seekFrame(state.index), position = state.source.positions[state.index];
      if (selected.frame !== undefined) services.drawWorld?.(selected.frame);
      services.render({ id: "replay", title: "FINALE CONTINUATION", detail: "SOURCE-LINKED · RECORDED APPLICATION CLOCK",
        paused: !state.playing, speed: state.speed, progress: duration === 0 ? 1 : state.elapsed / duration,
        elapsed: `${state.elapsed.toFixed(2)}s · TICK ${String(position?.tick)}`, duration: `${duration.toFixed(2)}s`,
        score: `FRAME ${String(position?.ordinal)}`, worldVisible: selected.frame !== undefined, infoVisible: state.info,
        infoRows: [{ label: "SCORED SOURCE", value: state.source.parentId }, { label: "CONTINUATION STATE", value: selected.result.semanticHash }],
        ...(state.notice === undefined ? {} : { notice: state.notice }), finaleNavigation: "BACK TO SCORED RUN" });
    },
    togglePause() { if (active !== undefined) active.playing = !active.playing; },
    seekBy(seconds: number) { if (active !== undefined) seekSeconds(active.elapsed + seconds); },
    seekToFraction(fraction: number) { if (active !== undefined) seekSeconds((active.source.positions.at(-1)?.seconds ?? 0) * Math.max(0, Math.min(1, fraction))); },
    jumpCheckpoint(direction: number) { seek((active?.index ?? 0) + Math.sign(direction)); },
    restart() { seek(0); },
    toggleInfo() { if (active !== undefined) active.info = !active.info; },
    setSpeed(speed: number) { if (active !== undefined && [0.25, 0.5, 1, 2, 4].includes(speed)) active.speed = speed; },
    status: () => active === undefined ? null : { paused: !active.playing, speed: active.speed, infoVisible: active.info,
      progress: active.elapsed / Math.max(0.001, active.source.positions.at(-1)?.seconds ?? 0), from: active.from },
  });
}
