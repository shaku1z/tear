export interface RunRecordingReplacementPort {
  recording(): boolean;
  stopInterruptedRecording(): void;
}

/** Seals an old replay before a new run rewinds authoritative tick ownership. */
export class RunReplacementGuard {
  readonly #recording: RunRecordingReplacementPort;

  constructor(recording: RunRecordingReplacementPort) {
    this.#recording = recording;
  }

  sealActiveRecording(): void {
    if (this.#recording.recording()) this.#recording.stopInterruptedRecording();
  }

  resetAuthoritativeClocks(reset: () => void): void {
    this.sealActiveRecording();
    reset();
  }
}
