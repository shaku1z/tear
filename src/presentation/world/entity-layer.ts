import { clamp } from "./primitives";

export interface EnemyLabelSnapshot {
  readonly kind: string;
  readonly supportType?: string | undefined;
  readonly enraged?: boolean | undefined;
  readonly variantName?: string | undefined;
  readonly affixCount?: number | undefined;
}

export interface EnemyVisualSnapshot {
  readonly x: number; readonly y: number; readonly halfWidth: number; readonly halfHeight: number;
  readonly radius: number; readonly color: string; readonly spawnTime: number; readonly flashTime: number;
  readonly dead: boolean; readonly depthPlane?: string | undefined; readonly cinematicPose: boolean;
  readonly buffs: readonly string[]; readonly label?: string | undefined;
  readonly draw: (canvas: CanvasRenderingContext2D) => void;
  readonly drawRear?: ((canvas: CanvasRenderingContext2D) => void) | undefined;
  readonly drawTransformation?: ((canvas: CanvasRenderingContext2D) => void) | undefined;
  readonly drawStatus?: (() => void) | undefined;
}

export interface PlayerVisualSnapshot {
  readonly x: number; readonly y: number; readonly halfWidth: number; readonly halfHeight: number;
}

export interface EntityLayerOptions {
  readonly darkTheme: boolean;
  readonly sandbox: boolean;
  readonly buffColors: Readonly<Record<string, string>>;
  readonly font: (size: number, bold?: boolean) => string;
}

export interface FloaterVisualSnapshot {
  readonly x: number; readonly y: number; readonly text: string; readonly color: string;
  readonly life: number; readonly big: boolean;
}

export function formatEnemyLabel(enemy: EnemyLabelSnapshot): string {
  let name: string;
  if (enemy.kind === "support") name = ({ priest: "War Priest", herald: "Herald", mender: "Mender", anchor: "Anchor" } as Record<string, string>)[enemy.supportType ?? ""] ?? "Support";
  else if (enemy.kind === "wraith") name = "Wraith";
  else if (enemy.kind === "chimera") name = "Chimera";
  else if (enemy.kind === "armored") name = enemy.enraged ? "Armored*" : "Armored";
  else name = enemy.variantName ?? (enemy.kind.charAt(0).toUpperCase() + enemy.kind.slice(1));
  return enemy.affixCount ? `${name} +${String(enemy.affixCount)}` : name;
}

export function renderRearEntities(canvas: CanvasRenderingContext2D, enemies: readonly EnemyVisualSnapshot[]): void {
  for (const enemy of enemies) if (!enemy.dead) enemy.drawRear?.(canvas);
}

function drawBuffBadge(canvas: CanvasRenderingContext2D, x: number, y: number, type: string, color: string): void {
  canvas.fillStyle = color; canvas.strokeStyle = "#000"; canvas.lineWidth = 1.5;
  canvas.beginPath(); canvas.arc(x, y, 7.5, 0, Math.PI * 2); canvas.fill(); canvas.stroke();
  canvas.strokeStyle = "#fff"; canvas.fillStyle = "#fff"; canvas.lineWidth = 1.6;
  if (type === "priest") {
    canvas.beginPath(); canvas.moveTo(x, y - 4.5); canvas.lineTo(x + 3.5, y - 2); canvas.lineTo(x + 3.5, y + 1.5);
    canvas.lineTo(x, y + 4.5); canvas.lineTo(x - 3.5, y + 1.5); canvas.lineTo(x - 3.5, y - 2); canvas.closePath(); canvas.fill();
  } else if (type === "herald") {
    canvas.beginPath(); canvas.moveTo(x - 4, y - 3); canvas.lineTo(x - 0.5, y); canvas.lineTo(x - 4, y + 3); canvas.stroke();
    canvas.beginPath(); canvas.moveTo(x + 0.5, y - 3); canvas.lineTo(x + 4, y); canvas.lineTo(x + 0.5, y + 3); canvas.stroke();
  } else if (type === "mender") {
    canvas.fillRect(x - 1, y - 4, 2, 8); canvas.fillRect(x - 4, y - 1, 8, 2);
  } else {
    canvas.beginPath(); canvas.arc(x, y, 3.8, 0, Math.PI * 2); canvas.stroke();
  }
}

export function renderEntityLayer(
  canvas: CanvasRenderingContext2D,
  enemies: readonly EnemyVisualSnapshot[],
  player: PlayerVisualSnapshot | undefined,
  options: EntityLayerOptions,
): void {
  for (const enemy of enemies) {
    if (enemy.spawnTime > 0) {
      const amount = clamp(enemy.spawnTime / 0.35, 0, 1);
      canvas.strokeStyle = enemy.color; canvas.lineWidth = 2; canvas.globalAlpha = amount;
      canvas.beginPath(); canvas.arc(enemy.x, enemy.y, enemy.radius + 6 + amount * 34, 0, Math.PI * 2); canvas.stroke();
      canvas.globalAlpha = 1 - amount * 0.65; enemy.draw(canvas); canvas.globalAlpha = 1;
    } else if (enemy.flashTime > 0) {
      canvas.save(); const scale = 1 + 0.14 * (enemy.flashTime / 0.08);
      canvas.translate(enemy.x, enemy.y); canvas.scale(scale, scale); canvas.translate(-enemy.x, -enemy.y);
      enemy.draw(canvas); canvas.restore();
    } else enemy.draw(canvas);
  }
  for (const enemy of enemies) if (!enemy.dead && enemy.cinematicPose) enemy.drawTransformation?.(canvas);
  for (const enemy of enemies) if (!enemy.dead && enemy.depthPlane !== "rear" && enemy.spawnTime <= 0) enemy.drawStatus?.();
  if (options.darkTheme) {
    canvas.strokeStyle = "rgba(236,233,247,0.45)"; canvas.lineWidth = 1.5;
    for (const enemy of enemies) {
      if (enemy.spawnTime > 0 || enemy.depthPlane === "rear") continue;
      canvas.strokeRect(enemy.x - enemy.halfWidth, enemy.y - enemy.halfHeight, enemy.halfWidth * 2, enemy.halfHeight * 2);
    }
    if (player) canvas.strokeRect(player.x - player.halfWidth, player.y - player.halfHeight, player.halfWidth * 2, player.halfHeight * 2);
  }
  for (const enemy of enemies) {
    if (enemy.spawnTime > 0 || enemy.depthPlane === "rear" || enemy.buffs.length === 0) continue;
    canvas.strokeStyle = options.buffColors[enemy.buffs[0] ?? ""] ?? "#000"; canvas.lineWidth = 2; canvas.globalAlpha = 0.75;
    canvas.strokeRect(enemy.x - enemy.halfWidth - 3, enemy.y - enemy.halfHeight - 3, enemy.halfWidth * 2 + 6, enemy.halfHeight * 2 + 6);
    canvas.globalAlpha = 1;
    const y = enemy.y - enemy.halfHeight - (options.sandbox ? 40 : 22);
    enemy.buffs.forEach((type, index) => {
      drawBuffBadge(canvas, enemy.x - (enemy.buffs.length - 1) * 9 + index * 18, y, type, options.buffColors[type] ?? "#000");
    });
  }
  if (options.sandbox) {
    canvas.textBaseline = "alphabetic";
    for (const enemy of enemies) {
      if (enemy.spawnTime > 0 || !enemy.label) continue;
      const y = enemy.y - enemy.halfHeight - 22; canvas.font = options.font(12, true); canvas.textAlign = "center";
      const width = canvas.measureText(enemy.label).width;
      canvas.globalAlpha = 0.85; canvas.fillStyle = "#fff"; canvas.fillRect(enemy.x - width / 2 - 3, y - 11, width + 6, 14);
      canvas.globalAlpha = 1; canvas.fillStyle = enemy.color || "#000"; canvas.fillText(enemy.label, enemy.x, y);
    }
  }
}

export function renderFloaters(canvas: CanvasRenderingContext2D, floaters: readonly FloaterVisualSnapshot[]): void {
  canvas.textAlign = "center";
  for (const floater of floaters) {
    canvas.globalAlpha = clamp(floater.life / 0.8, 0, 1); canvas.fillStyle = floater.color;
    const age = 0.8 - floater.life, pop = age < 0.12 ? 1.5 - 0.5 * (age / 0.12) : 1, base = floater.big ? 26 : 16;
    canvas.font = `${floater.big ? "bold " : ""}${String(Math.round(base * pop))}px 'Courier New', monospace`;
    canvas.fillText(floater.text, floater.x, floater.y);
  }
  canvas.globalAlpha = 1;
}
