export interface ReplayPose {
  readonly x: number; readonly y: number; readonly face: number; readonly bx: number; readonly by: number;
}

export interface ReplayPuppet {
  x: number; y: number; readonly color?: string;
  draw?(canvas: CanvasRenderingContext2D, player: unknown): void;
}

export interface ReplayWorldGhost<SpawnInfo> {
  crossed(): Readonly<{
    events: readonly Readonly<{ k: string; x: number; y: number }>[];
    deaths: readonly Readonly<{ id: string | number }>[];
  }>;
  enemiesAt(): readonly Readonly<{ id: string | number; x: number; y: number }>[];
  spawnInfo(id: string | number): SpawnInfo | null | undefined;
}

export interface ReplayWorldEffects {
  ring(x: number, y: number, radius: number, color: string): void;
  explode(x: number, y: number, color: string, scale: number): void;
  death(x: number, y: number, count: number, color: string): void;
  update(deltaSeconds: number): void;
  draw(canvas: CanvasRenderingContext2D): void;
}

export function renderReplayWorldFrame<Stage, Platform, SpawnInfo>(input: {
  readonly canvas: CanvasRenderingContext2D;
  readonly screen: Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly width: number;
  readonly stage: Stage & Readonly<{ bg: string }>;
  readonly platforms: readonly Platform[];
  readonly platformIsFloor: (platform: Platform) => boolean;
  readonly backdrop: Readonly<{
    draw(canvas: CanvasRenderingContext2D, stage: Stage, time: number, focusX: number): void;
    platform(canvas: CanvasRenderingContext2D, platform: Platform, stage: Stage, floor: boolean): void;
    post(canvas: CanvasRenderingContext2D, stage: Stage): void;
  }>;
  readonly effects: ReplayWorldEffects;
  readonly ghost: ReplayWorldGhost<SpawnInfo>;
  readonly pose?: ReplayPose;
  readonly puppets: Record<PropertyKey, ReplayPuppet | null | undefined>;
  readonly createPuppet: (spawn: SpawnInfo) => ReplayPuppet | null;
  readonly fallbackPlayer: unknown;
  readonly themeInk: string;
  readonly perfectColor: string;
  readonly slamColor: string;
  readonly lowGraphics: boolean;
  readonly time: number;
  readonly deltaSeconds: number;
}): void {
  const { canvas, stage, pose } = input;
  canvas.fillStyle = stage.bg;
  canvas.fillRect(input.screen.x, input.screen.y, input.screen.w, input.screen.h);
  input.backdrop.draw(canvas, stage, input.time, pose?.x ?? input.width / 2);
  for (const platform of input.platforms) {
    input.backdrop.platform(canvas, platform, stage, input.platformIsFloor(platform));
  }

  const crossed = input.ghost.crossed();
  for (const event of crossed.events) {
    if (event.k === "parry") input.effects.ring(event.x, event.y, 10, input.perfectColor);
    else if (event.k === "superslam" || event.k === "slam") input.effects.ring(event.x, event.y, 12, input.slamColor);
    else if (event.k === "bossKill") input.effects.explode(event.x, event.y, input.perfectColor, 1.6);
    else if (event.k === "revive") input.effects.ring(event.x, event.y, 16, input.perfectColor);
  }
  for (const death of crossed.deaths) {
    const puppet = input.puppets[death.id];
    if (puppet !== null && puppet !== undefined) input.effects.death(puppet.x, puppet.y, 8, puppet.color ?? "#888");
    input.puppets[death.id] = undefined;
  }
  input.effects.update(input.deltaSeconds);

  canvas.save();
  canvas.globalAlpha = 0.9;
  for (const enemy of input.ghost.enemiesAt()) {
    let puppet = input.puppets[enemy.id];
    if (puppet === undefined) {
      const spawn = input.ghost.spawnInfo(enemy.id);
      puppet = spawn === undefined || spawn === null ? null : input.createPuppet(spawn);
      input.puppets[enemy.id] = puppet;
    }
    if (puppet === null) continue;
    puppet.x = enemy.x;
    puppet.y = enemy.y;
    try {
      puppet.draw?.(canvas, pose ?? input.fallbackPlayer);
    } catch {
      canvas.fillStyle = puppet.color ?? "#888";
      canvas.fillRect(enemy.x - 14, enemy.y - 18, 28, 36);
    }
  }
  canvas.restore();
  input.effects.draw(canvas);

  if (pose !== undefined) {
    canvas.save(); canvas.globalAlpha = 0.55;
    canvas.fillStyle = input.themeInk; canvas.fillRect(pose.x - 13, pose.y - 24, 26, 48);
    canvas.fillStyle = input.perfectColor; canvas.fillRect(pose.x + pose.face * 4 - 3, pose.y - 12, 7, 6);
    canvas.globalAlpha = 0.6; canvas.strokeStyle = input.perfectColor; canvas.lineWidth = 4; canvas.lineCap = "round";
    if (!input.lowGraphics) { canvas.shadowColor = input.perfectColor; canvas.shadowBlur = 12; }
    canvas.beginPath(); canvas.moveTo(pose.x, pose.y - 6); canvas.lineTo(pose.bx, pose.by); canvas.stroke();
    canvas.shadowBlur = 0; canvas.restore();
  }
  input.backdrop.post(canvas, stage);
}
