import { lazySlot } from "../../domain/lazy-module";
import type * as LiveReplayRecorder from "./live-replay-recorder";

export type LiveReplayRecorderModule = typeof LiveReplayRecorder;

/**
 * Where the live replay recorder's code comes from (src/app/replay/live-replay-recorder.ts). The row in
 * src/app/shell/deferred-modules.ts installs its loader; a run that starts before it has loaded is not
 * recorded, and run start never waits for it.
 */
export const liveReplayRecorder = lazySlot<LiveReplayRecorderModule>("The replay recorder could not load.");
