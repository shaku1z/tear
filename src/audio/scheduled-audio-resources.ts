export class ScheduledAudioResourceTracker {
  readonly voiceCap: number;
  readonly #cleanups = new Set<() => void>();
  #activeVoices = 0;
  #activeGraphNodes = 0;

  constructor(voiceCap = 24) {
    this.voiceCap = voiceCap;
  }

  get activeVoices(): number { return this.#activeVoices; }
  get activeGraphNodes(): number { return this.#activeGraphNodes; }

  track(source: AudioScheduledSourceNode, connectedNodes: readonly AudioNode[] = []): boolean {
    if (this.#activeVoices >= this.voiceCap) return false;
    this.#activeVoices++;
    this.#activeGraphNodes += connectedNodes.length + 1;
    let completed = false;
    const cleanup = () => {
      if (completed) return;
      completed = true;
      source.removeEventListener("ended", cleanup);
      source.disconnect();
      for (const node of connectedNodes) node.disconnect();
      this.#activeVoices = Math.max(0, this.#activeVoices - 1);
      this.#activeGraphNodes = Math.max(0, this.#activeGraphNodes - connectedNodes.length - 1);
      this.#cleanups.delete(cleanup);
    };
    this.#cleanups.add(cleanup);
    source.addEventListener("ended", cleanup, { once: true });
    return true;
  }

  dispose(): void {
    for (const cleanup of [...this.#cleanups]) cleanup();
  }
}
