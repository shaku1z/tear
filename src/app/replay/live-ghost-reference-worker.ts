// Worker entry: the worker's own code plus the replay engine it uses, linked into this one
// bundle so no second copy of the engine is split off (see src/ghost/replay-engine.ts).
import "../../ghost/live-ghost-reference-worker";
import { installReplayEngine } from "../../ghost/replay-engine";
import * as replayEngineModule from "../../tearbench/production-replay-composition";

installReplayEngine(() => Promise.resolve(replayEngineModule));
