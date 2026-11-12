export interface AchievementToastSource {
  readonly id: string; readonly name: string; readonly desc: string; readonly rarity: string; readonly cat: string;
}

export interface AchievementToastView {
  readonly name: string; readonly description: string; readonly rarityName: string; readonly rarityColor: string;
  readonly categoryIcon: string; readonly shards: number; readonly coins: number; readonly reveal: number;
}

export class AchievementToastController {
  #active: AchievementToastSource | null = null;
  #elapsed = 0;
  readonly #ease: (value: number) => number;

  constructor(ease: (value: number) => number) { this.#ease = ease; }

  step(deltaSeconds: number, input: {
    readonly pending: AchievementToastSource[];
    readonly rarities: Readonly<Record<string, Readonly<{ name: string; color: string }>>>;
    readonly commonRarity: Readonly<{ name: string; color: string }>;
    readonly categories: Readonly<Record<string, Readonly<{ icon?: string }>>>;
    readonly markSeen: (id: string) => void; readonly save: () => void;
    readonly shardsFor: (achievement: AchievementToastSource) => number;
    readonly coinsFor: (achievement: AchievementToastSource) => number;
  }): AchievementToastView | null {
    if (this.#active === null && input.pending.length > 0) {
      this.#active = input.pending.shift() ?? null;
      this.#elapsed = 0;
      if (this.#active !== null) { input.markSeen(this.#active.id); input.save(); }
    }
    const achievement = this.#active;
    if (achievement === null) return null;
    this.#elapsed += deltaSeconds;
    const hold = 3.6, entrance = 0.4, exit = 0.4;
    if (this.#elapsed >= hold) { this.#active = null; return null; }
    const reveal = this.#elapsed < entrance ? this.#ease(this.#elapsed / entrance)
      : this.#elapsed > hold - exit ? this.#ease((hold - this.#elapsed) / exit) : 1;
    const rarity = input.rarities[achievement.rarity] ?? input.commonRarity;
    const category = input.categories[achievement.cat];
    return Object.freeze({ name: achievement.name, description: achievement.desc,
      rarityName: rarity.name, rarityColor: rarity.color, categoryIcon: category?.icon ?? "★",
      shards: input.shardsFor(achievement), coins: input.coinsFor(achievement), reveal });
  }
}
