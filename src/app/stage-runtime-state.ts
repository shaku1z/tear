export class StageRuntimeState<TStage, TPlatforms> {
  index = 0;
  current: TStage;
  platforms: TPlatforms;
  bannerSeconds = 0;
  name = "";
  readonly #stageAt: (index: number) => TStage;
  readonly #platformsAt: (index: number) => TPlatforms;

  constructor(stageAt: (index: number) => TStage, platformsAt: (index: number) => TPlatforms) {
    this.#stageAt = stageAt; this.#platformsAt = platformsAt;
    this.current = stageAt(0); this.platforms = platformsAt(0);
  }

  load(index: number): void {
    this.index = index; this.current = this.#stageAt(index); this.platforms = this.#platformsAt(index);
  }

  setBanner(name: string, seconds: number): void { this.name = name; this.bannerSeconds = seconds; }
  resetBanner(): void { this.bannerSeconds = 0; }
}
