export interface TearWipeOptions {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly createCanvas: () => HTMLCanvasElement;
  readonly reducedEffects: () => boolean;
  readonly flashScale: () => number;
  readonly random: () => number;
  readonly ease: (value: number) => number;
  readonly durationSeconds?: number;
  readonly maxParticles?: number;
}

interface WipeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  w: number;
}

/** Device-space biome transition. It owns no simulation state and is allocation bounded. */
export class TearWipe {
  readonly durationSeconds: number;
  readonly maxParticles: number;
  readonly #options: TearWipeOptions;
  readonly #particles: WipeParticle[] = [];
  #remainingSeconds = 0;
  #snapshot: HTMLCanvasElement | null = null;

  constructor(options: TearWipeOptions) {
    this.#options = options;
    this.durationSeconds = options.durationSeconds ?? 1.1;
    this.maxParticles = options.maxParticles ?? 256;
    if (!(this.durationSeconds > 0)) throw new RangeError("durationSeconds must be positive");
    if (!Number.isSafeInteger(this.maxParticles) || this.maxParticles < 0) throw new RangeError("maxParticles must be a non-negative integer");
  }

  get active(): boolean { return this.#remainingSeconds > 0 && this.#snapshot !== null; }
  get remainingSeconds(): number { return Math.max(0, this.#remainingSeconds); }
  get particleCount(): number { return this.#particles.length; }

  begin(): void {
    try {
      this.#snapshot ??= this.#options.createCanvas();
      this.#snapshot.width = this.#options.canvas.width;
      this.#snapshot.height = this.#options.canvas.height;
      const snapshotContext = this.#snapshot.getContext("2d");
      if (snapshotContext === null) throw new Error("2D snapshot context is unavailable");
      snapshotContext.drawImage(this.#options.canvas, 0, 0);
      this.#remainingSeconds = this.durationSeconds;
      this.#particles.length = 0;
    } catch {
      this.#remainingSeconds = 0;
    }
  }

  draw(elapsedSeconds: number): void {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return;
    const snapshot = this.#snapshot;
    const active = this.#remainingSeconds > 0;
    if ((!active || snapshot === null) && this.#particles.length === 0) return;

    const { canvas, context, random } = this.#options;
    const glow = !this.#options.reducedEffects();
    const width = canvas.width;
    const height = canvas.height;
    const slope = width * 0.22;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);

    if (active && snapshot !== null) {
      this.#remainingSeconds -= elapsedSeconds;
      const progress = 1 - Math.max(this.#remainingSeconds, 0) / this.durationSeconds;
      const eased = this.#options.ease(progress);
      const x = -slope + (width + slope * 2) * eased;
      const directionLength = Math.hypot(slope, height);
      const normalX = -height / directionLength;
      const normalY = -slope / directionLength;

      context.globalAlpha = Math.pow(1 - progress, 1.6) * 0.45;
      context.drawImage(snapshot, 0, 0);
      context.globalAlpha = 1;
      context.save(); context.beginPath();
      context.moveTo(x, 0); context.lineTo(x - slope, height); context.lineTo(width, height); context.lineTo(width, 0);
      context.closePath(); context.clip(); context.drawImage(snapshot, 0, 0); context.restore();

      context.save(); context.beginPath();
      context.moveTo(x, 0); context.lineTo(x - slope, height); context.lineTo(-width, height); context.lineTo(-width, 0);
      context.closePath(); context.clip();
      const middleX = x - slope / 2;
      const middleY = height / 2;
      const bandWidth = width * 0.09;
      const gradient = context.createLinearGradient(middleX, middleY, middleX + normalX * bandWidth, middleY + normalY * bandWidth);
      gradient.addColorStop(0, "rgba(19,196,214,0.30)"); gradient.addColorStop(0.5, "rgba(19,196,214,0.08)"); gradient.addColorStop(1, "rgba(19,196,214,0)");
      context.fillStyle = gradient;
      if (glow) context.globalCompositeOperation = "lighter";
      context.fillRect(0, 0, width, height);
      context.restore();

      context.lineCap = "round";
      if (glow) { context.shadowColor = "#13c4d6"; context.shadowBlur = 26; }
      context.strokeStyle = "rgba(19,196,214,0.85)"; context.lineWidth = Math.max(6, width * 0.006);
      context.beginPath(); context.moveTo(x, -20); context.lineTo(x - slope, height + 20); context.stroke();
      context.strokeStyle = "#eafcff"; context.lineWidth = Math.max(2, width * 0.002);
      if (glow) context.shadowBlur = 14;
      context.beginPath(); context.moveTo(x, -20); context.lineTo(x - slope, height + 20); context.stroke();
      context.shadowBlur = 0;

      if (glow) {
        for (let index = 0; index < 3 && this.#particles.length < this.maxParticles; index += 1) {
          const point = random();
          this.#particles.push({
            x: x - slope * point, y: height * point,
            vx: normalX * (80 + random() * 220) - slope / directionLength * 40 * (random() - 0.5),
            vy: normalY * (80 + random() * 220) + height / directionLength * 40 * (random() - 0.5),
            life: 0.3 + random() * 0.35, max: 0.65, w: 1.5 + random() * 2.5,
          });
        }
      }
      if (progress < 0.16) {
        context.globalAlpha = (1 - progress / 0.16) * 0.22 * this.#options.flashScale();
        context.fillStyle = "#eafcff"; context.fillRect(0, 0, width, height); context.globalAlpha = 1;
      }
    }

    if (glow) { context.globalCompositeOperation = "lighter"; context.lineCap = "round"; }
    let write = 0;
    for (const particle of this.#particles) {
      particle.life -= elapsedSeconds;
      if (particle.life <= 0) continue;
      particle.x += particle.vx * elapsedSeconds; particle.y += particle.vy * elapsedSeconds;
      particle.vx *= 0.94; particle.vy *= 0.94;
      context.globalAlpha = Math.min(1, Math.max(0, particle.life / particle.max));
      context.strokeStyle = random() < 0.4 ? "#eafcff" : "#13c4d6"; context.lineWidth = particle.w;
      context.beginPath(); context.moveTo(particle.x, particle.y);
      context.lineTo(particle.x - particle.vx * 0.03, particle.y - particle.vy * 0.03); context.stroke();
      this.#particles[write] = particle;
      write += 1;
    }
    this.#particles.length = write;
    context.globalAlpha = 1;
    context.restore();
  }
}
