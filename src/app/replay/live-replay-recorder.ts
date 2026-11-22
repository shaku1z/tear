/**
 * The live replay recorder's code: the tap that records a run and the store that keeps it. Live startup
 * does not carry it; it is fetched on first use and ahead on an idle menu (`liveReplayRecorder`,
 * src/app/shell/deferred-modules.ts), and `src/app/replay/live-replay-production.ts` drives it.
 */
export { createLiveReplayTap } from "./live-replay-tap";
export { openReplayRecordStore } from "../../replay/record-store";
