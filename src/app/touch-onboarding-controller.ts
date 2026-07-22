export class TouchOnboardingController {
  #elapsed = 0;
  step(deltaSeconds: number, alreadySeen: boolean): Readonly<{ alpha: number; completed: boolean }> {
    if (alreadySeen) return Object.freeze({ alpha: 0, completed: false });
    this.#elapsed += deltaSeconds;
    return Object.freeze({ alpha: this.#elapsed < 6 ? 1 : Math.max(0, Math.min(1, 7 - this.#elapsed)), completed: this.#elapsed >= 7 });
  }
}
