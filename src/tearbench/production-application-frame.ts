import type { CinematicTimeline } from "../gameplay/runtime/cinematic-director";

/** Explicit application-frame inputs, independent of fixed simulation ticks. */
export type ProductionApplicationFrameConfirm = NonNullable<
  Parameters<InstanceType<typeof CinematicTimeline.Director>["update"]>[1]
>;
