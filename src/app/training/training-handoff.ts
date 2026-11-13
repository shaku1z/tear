interface TrainingHandoffPorts<Run extends { readonly mode: string }> {
  readonly run: () => Run | null;
  readonly phase: () => string;
  readonly pause: () => void;
  readonly releasePointer: () => void;
  /** Host task boundary: the requesting canonical step and its caller must return first. */
  readonly defer: (commit: () => void) => void;
  /** The existing complete baseline new-run transaction, never a partial world reset. */
  readonly startPractice: () => void;
}

/** A terminal training tick retains its receipt before the host constructs the next run. */
export function createLiveTrainingHandoff<Run extends { readonly mode: string }>(ports: TrainingHandoffPorts<Run>) {
  let pending: { readonly run: Run } | undefined;
  return Object.freeze({
    request(origin?: "completion") {
      if (origin === undefined) {
        pending = undefined;
        ports.startPractice();
        ports.pause();
        ports.releasePointer();
        return;
      }
      const run = ports.run();
      if (run?.mode !== "tutorial" || ports.phase() !== "free-practice" || pending?.run === run) return;
      const intent = { run };
      pending = intent;
      ports.pause();
      ports.releasePointer();
      ports.defer(() => {
        if (pending !== intent) return;
        pending = undefined;
        if (ports.run() !== intent.run || ports.phase() !== "free-practice") return;
        ports.startPractice();
        ports.pause();
        ports.releasePointer();
      });
    },
  });
}
