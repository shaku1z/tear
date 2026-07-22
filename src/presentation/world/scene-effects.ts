import { clamp } from "./primitives";

export interface BossDressingSnapshot {
  readonly bossId: string;
  readonly color: string;
}

export interface CrackSnapshot {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly time: number; readonly maximum: number; readonly color: string;
}

export interface WallCapSnapshot {
  readonly x: number; readonly y: number; readonly w: number;
  readonly life: number; readonly maximum: number;
}

export interface SlowZoneVisualSnapshot {
  readonly x: number; readonly y: number; readonly radius: number; readonly life: number;
}

export interface BossZoneVisualSnapshot {
  readonly x: number; readonly width: number; readonly kind: string;
  readonly active: boolean; readonly arming: boolean; readonly warning: boolean; readonly warningAmount: number;
  readonly life: number; readonly maximumLife: number; readonly direction: number;
}

export interface SceneEffectsSnapshot {
  readonly width: number; readonly height: number; readonly groundY: number; readonly timeMilliseconds: number;
  readonly lowGraphics: boolean; readonly highContrast: boolean; readonly darkTheme: boolean; readonly ink: string;
  readonly dressing?: BossDressingSnapshot | undefined;
  readonly cracks: readonly CrackSnapshot[];
  readonly walls: readonly WallCapSnapshot[];
  readonly slowZones: readonly SlowZoneVisualSnapshot[];
  readonly bossZones: readonly BossZoneVisualSnapshot[];
  readonly zoneColor: string;
  readonly sludgeColor: string;
  readonly slamColor: string;
  readonly bomberColor: string;
  readonly chargerColor: string;
  readonly defaultZoneWidth: number;
  readonly seamLife: number;
  readonly trailLife: number;
}

function hazardStripes(
  canvas: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  alpha: number,
  now: number,
): void {
  canvas.save(); canvas.beginPath(); canvas.rect(x, y, width, height); canvas.clip();
  canvas.strokeStyle = color; canvas.lineWidth = 11; canvas.globalAlpha = alpha;
  const step = 30, offset = (now / 26) % step;
  for (let index = -height; index < width + height; index += step) {
    canvas.beginPath(); canvas.moveTo(x + index + offset, y + height); canvas.lineTo(x + index + offset + height, y); canvas.stroke();
  }
  canvas.restore();
}

export function renderBossDressing(canvas: CanvasRenderingContext2D, snapshot: SceneEffectsSnapshot): void {
  const boss = snapshot.dressing;
  if (!boss || snapshot.lowGraphics) return;
  const now = snapshot.timeMilliseconds, ground = snapshot.groundY, width = snapshot.width;
  canvas.save();
  if (boss.bossId === "warden") {
    canvas.globalAlpha = 0.14; canvas.fillStyle = boss.color;
    for (const x of [180, 800, 1420]) {
      const sway = Math.sin(now / 1400 + x) * 8;
      canvas.beginPath(); canvas.moveTo(x - 26, 0); canvas.lineTo(x + 26, 0);
      canvas.lineTo(x + 18 + sway, 190); canvas.lineTo(x - 18 + sway, 190); canvas.closePath(); canvas.fill();
    }
    canvas.globalAlpha = 0.10; canvas.strokeStyle = snapshot.ink; canvas.lineWidth = 3; canvas.setLineDash([26, 22]);
    canvas.beginPath(); canvas.moveTo(120, ground + 26); canvas.lineTo(width - 120, ground + 26); canvas.stroke(); canvas.setLineDash([]);
  } else if (boss.bossId === "colossus") {
    const glow = canvas.createLinearGradient(0, ground - 220, 0, ground);
    glow.addColorStop(0, "rgba(232,134,46,0)"); glow.addColorStop(1, "rgba(232,134,46,0.10)");
    canvas.fillStyle = glow; canvas.fillRect(0, ground - 220, width, 220);
    canvas.globalAlpha = 0.16; canvas.strokeStyle = snapshot.ink; canvas.lineWidth = 4;
    for (const x of [260, 640, 1000, 1360]) {
      const sway = Math.sin(now / 1700 + x) * 10;
      canvas.beginPath(); canvas.moveTo(x, 0); canvas.quadraticCurveTo(x + sway, 110, x + sway, 205 + (x % 3) * 24); canvas.stroke();
    }
  } else if (boss.bossId === "aldric") {
    const throneX = width / 2;
    canvas.globalAlpha = 0.12; canvas.fillStyle = snapshot.ink;
    canvas.fillRect(throneX - 60, ground - 150, 120, 150);
    canvas.fillRect(throneX - 84, ground - 96, 24, 96); canvas.fillRect(throneX + 60, ground - 96, 24, 96);
    canvas.beginPath(); canvas.moveTo(throneX - 40, ground - 150); canvas.lineTo(throneX - 18, ground - 196);
    canvas.lineTo(throneX, ground - 154); canvas.lineTo(throneX + 18, ground - 196);
    canvas.lineTo(throneX + 40, ground - 150); canvas.closePath(); canvas.fill();
    canvas.globalAlpha = 0.35; canvas.fillStyle = snapshot.bomberColor;
    for (let index = 0; index < 7; index += 1) {
      const x = (index * 257 + now / 40) % width, y = ground - 60 - ((now / 16 + index * 131) % 420);
      canvas.fillRect(x, y, 3, 3);
    }
  }
  canvas.restore(); canvas.globalAlpha = 1;
}

export function renderPlatformCracks(canvas: CanvasRenderingContext2D, snapshot: SceneEffectsSnapshot): void {
  for (const crack of snapshot.cracks) {
    const amount = 1 - clamp(crack.time / (crack.maximum || 0.8), 0, 1);
    canvas.save();
    canvas.globalAlpha = (0.35 + 0.5 * amount) * (0.65 + 0.35 * Math.sin(snapshot.timeMilliseconds / (60 - amount * 25)));
    canvas.strokeStyle = snapshot.highContrast ? (snapshot.darkTheme ? "#fff36b" : "#4b00d1") : crack.color;
    canvas.lineWidth = snapshot.highContrast ? 4 : 2; canvas.beginPath();
    const count = 3 + Math.floor(amount * 3);
    for (let index = 0; index < count; index += 1) {
      const x = crack.x + crack.w * (0.12 + 0.76 * ((index * 0.37 + 0.13) % 1));
      canvas.moveTo(x, crack.y); canvas.lineTo(x + (index % 2 ? 9 : -9), crack.y + (crack.h || 22) * 0.7);
    }
    canvas.stroke(); canvas.restore();
  }
}

export function renderGroundHazards(canvas: CanvasRenderingContext2D, snapshot: SceneEffectsSnapshot): void {
  for (const wall of snapshot.walls) {
    const amount = clamp(wall.life / wall.maximum, 0, 1);
    canvas.fillStyle = snapshot.sludgeColor; canvas.globalAlpha = 0.35 + 0.4 * amount;
    canvas.fillRect(wall.x - 2, wall.y, wall.w + 4, 6); canvas.globalAlpha = 1;
  }
  for (const zone of snapshot.slowZones) {
    canvas.fillStyle = snapshot.sludgeColor; canvas.globalAlpha = 0.25 + 0.4 * clamp(zone.life / 2, 0, 1);
    canvas.beginPath(); canvas.ellipse(zone.x, zone.y - 2, zone.radius, 9, 0, 0, Math.PI * 2); canvas.fill(); canvas.globalAlpha = 1;
  }
}

function drawZone(canvas: CanvasRenderingContext2D, zone: BossZoneVisualSnapshot, snapshot: SceneEffectsSnapshot): void {
  const width = zone.width || snapshot.defaultZoneWidth, x0 = zone.x - width / 2, ground = snapshot.groundY;
  const now = snapshot.timeMilliseconds, pulse = 0.5 + 0.5 * Math.sin(now / 140), active = zone.active;
  canvas.save();
  if (zone.kind === "searchlight") {
    const apex = 60;
    canvas.globalAlpha = active ? 0.16 : 0.07; canvas.fillStyle = "#f4ecc9";
    canvas.beginPath(); canvas.moveTo(zone.x - 14, apex); canvas.lineTo(zone.x + 14, apex);
    canvas.lineTo(x0 + width, ground); canvas.lineTo(x0, ground); canvas.closePath(); canvas.fill();
    canvas.globalAlpha = active ? 0.5 + 0.35 * pulse : 0.18; canvas.strokeStyle = active ? snapshot.zoneColor : "#f4ecc9"; canvas.lineWidth = 2;
    canvas.beginPath(); canvas.ellipse(zone.x, ground, width * 0.5, 8, 0, 0, Math.PI * 2); canvas.stroke();
    canvas.fillStyle = "#f4ecc9"; canvas.globalAlpha = 0.35;
    for (let index = 0; index < 5; index += 1) {
      const y = apex + ((now / 22 + index * 173) % (ground - apex));
      canvas.fillRect(zone.x + Math.sin(index * 2.7 + now / 900) * width * 0.3 * (y / ground), y, 2, 2);
    }
  } else if (zone.kind === "cage") {
    for (let index = 0; index < 5; index += 1) {
      const x = x0 + (index + 0.5) * (width / 5);
      canvas.globalAlpha = 0.55 + 0.35 * Math.sin(now / 160 + index); canvas.fillStyle = snapshot.zoneColor;
      canvas.fillRect(x - 3, 40, 6, snapshot.height - 40); canvas.globalAlpha = 0.9; canvas.fillStyle = "#fff";
      canvas.fillRect(x - 1, 40, 2, snapshot.height - 40);
    }
  } else if (zone.kind === "panel") {
    const heat = active ? 1 : (zone.arming ? 0.45 + 0.25 * pulse : 0.12);
    const color = active ? "#fff" : (zone.arming ? "#e8862e" : "#6a6f78");
    canvas.globalAlpha = 0.25 + heat * 0.45; canvas.fillStyle = active ? snapshot.slamColor : color; canvas.fillRect(x0, ground, width, 30);
    canvas.globalAlpha = 0.85; canvas.strokeStyle = color; canvas.lineWidth = 2;
    for (let index = 0; index <= 6; index += 1) { const x = x0 + index * (width / 6); canvas.beginPath(); canvas.moveTo(x, ground); canvas.lineTo(x, ground + 30); canvas.stroke(); }
    canvas.strokeRect(x0, ground, width, 30);
    if (active || zone.arming) {
      canvas.globalAlpha = 0.30 * heat; canvas.strokeStyle = active ? "#fff" : "#e8862e"; canvas.lineWidth = 1.5;
      for (let index = 0; index < 4; index += 1) {
        const x = x0 + (index + 0.5) * (width / 4), offset = (now / 7 + index * 40) % 110;
        canvas.beginPath(); canvas.moveTo(x + Math.sin(now / 90 + index) * 5, ground - offset);
        canvas.quadraticCurveTo(x + 7, ground - offset - 16, x, ground - offset - 30); canvas.stroke();
      }
    }
  } else if (zone.kind === "fire") {
    const amount = clamp(zone.warningAmount, 0, 1);
    canvas.globalAlpha = 0.48; canvas.fillStyle = "#1c1514"; canvas.fillRect(x0, ground, width, 12);
    if (active) {
      const count = snapshot.lowGraphics ? 2 : Math.max(3, Math.floor(width / 34));
      for (let index = 0; index < count; index += 1) {
        const x = x0 + (index + 0.5) * width / count, height = 48 + Math.sin(now / 85 + index * 2.4 + zone.x) * 14;
        canvas.globalAlpha = 0.78; canvas.fillStyle = snapshot.bomberColor; canvas.beginPath(); canvas.moveTo(x - 12, ground);
        canvas.quadraticCurveTo(x - 5, ground - height * 0.5, x + Math.sin(now / 68 + index) * 5, ground - height);
        canvas.quadraticCurveTo(x + 7, ground - height * 0.45, x + 12, ground); canvas.closePath(); canvas.fill();
      }
      canvas.globalAlpha = 0.72; canvas.strokeStyle = "#ffd66e"; canvas.lineWidth = 3;
      for (const x of [x0 + 2, x0 + width - 2]) { canvas.beginPath(); canvas.moveTo(x, ground); canvas.lineTo(x, ground - 62); canvas.stroke(); }
    }
    if (zone.warning) {
      const committed = amount > 0.78;
      canvas.globalAlpha = 0.65 + amount * 0.3; canvas.fillStyle = committed ? "#fff7d6" : "#e5a62d";
      canvas.fillRect(x0 + 3, ground - 5, width - 6, committed ? 6 : 4);
      canvas.globalAlpha = 0.2 + amount * 0.28; canvas.fillStyle = "#e5a62d";
      canvas.fillRect(x0 + 5, ground - 10 - amount * 12, width - 10, 8 + amount * 12);
      if (!snapshot.lowGraphics) for (let index = 0; index < 4; index += 1) {
        const x = x0 + (index + 0.5) * width / 4, y = ground - 10 - ((now / 7 + index * 31) % (30 + amount * 50));
        canvas.globalAlpha = 0.4 + amount * 0.4; canvas.fillStyle = committed ? "#fff" : "#ffd66e"; canvas.fillRect(x, y, 3, 3);
      }
    } else {
      canvas.globalAlpha = active ? 0.78 : 0.25 + 0.18 * pulse; canvas.fillStyle = active ? "#fff0bc" : snapshot.bomberColor;
      canvas.fillRect(x0 + 2, ground - (active ? 4 : 2), width - 4, active ? 4 : 2);
    }
  } else if (zone.kind === "seam") {
    const amount = clamp(zone.life / (zone.maximumLife || snapshot.seamLife), 0, 1), direction = zone.direction || 1;
    canvas.globalAlpha = 0.24 + amount * 0.68; canvas.strokeStyle = snapshot.bomberColor; canvas.lineWidth = 5;
    canvas.beginPath(); canvas.moveTo(x0, ground - 2);
    for (let index = 1; index <= 6; index += 1) canvas.lineTo(x0 + width * index / 6, ground - 2 - ((index % 2) ? 5 * amount : 0));
    canvas.stroke(); canvas.globalAlpha = 0.65 * amount; canvas.fillStyle = "#ffd66e";
    for (let index = 1; index < 5; index += 1) {
      const x = x0 + width * index / 5, tip = x + direction * 8;
      canvas.beginPath(); canvas.moveTo(x - direction * 5, ground - 10); canvas.lineTo(tip, ground - 5); canvas.lineTo(x - direction * 5, ground); canvas.closePath(); canvas.fill();
    }
    if (!snapshot.lowGraphics) { const x = x0 + ((now / 5 + zone.x) % width); canvas.globalAlpha = 0.6 * amount; canvas.fillRect(x, ground - 18 - 12 * pulse, 3, 3); }
  } else if (zone.kind === "trail") {
    const amount = clamp(zone.life / (zone.maximumLife || snapshot.trailLife || 1), 0, 1);
    canvas.globalAlpha = 0.16 + amount * 0.25; canvas.fillStyle = snapshot.zoneColor; canvas.fillRect(x0, ground - 8, width, 16);
    canvas.globalAlpha = 0.65 * amount; canvas.strokeStyle = "#f4ecc9"; canvas.lineWidth = 2;
    for (let index = 0; index < 5; index += 1) { const x = x0 + ((index * 29 + now / 18) % Math.max(1, width)); canvas.beginPath(); canvas.moveTo(x, ground - 10); canvas.lineTo(x + 8, ground + 8); canvas.stroke(); }
    canvas.globalAlpha = 0.8 * amount; canvas.fillStyle = snapshot.zoneColor; canvas.fillRect(x0, ground - 2, width, 4);
  } else {
    const height = snapshot.height - ground;
    canvas.fillStyle = snapshot.zoneColor; canvas.globalAlpha = active ? 0.42 : 0.12; canvas.fillRect(x0, ground, width, height);
    if (active) { hazardStripes(canvas, x0, ground, width, height, "#000", 0.16, now); hazardStripes(canvas, x0, ground, width, height, "#fff", 0.10, now); }
  }
  const warning = zone.arming || zone.warning || zone.warningAmount > 0;
  if (warning && snapshot.highContrast) {
    const color = snapshot.darkTheme ? "#fff36b" : "#4b00d1", top = ground - (zone.kind === "fire" ? 72 : 48);
    canvas.globalAlpha = 0.94; canvas.strokeStyle = color; canvas.lineWidth = 4; canvas.setLineDash([12, 7]);
    canvas.strokeRect(x0 + 2, top, Math.max(0, width - 4), ground - top); canvas.setLineDash([]);
    for (let x = x0 + 22; x < x0 + width - 8; x += 38) {
      canvas.beginPath(); canvas.moveTo(x - 8, ground - 20); canvas.lineTo(x, ground - 10); canvas.lineTo(x + 8, ground - 20); canvas.stroke();
    }
  }
  canvas.restore(); canvas.globalAlpha = 1;
}

export function renderSceneEffects(canvas: CanvasRenderingContext2D, snapshot: SceneEffectsSnapshot): void {
  renderBossDressing(canvas, snapshot);
  renderPlatformCracks(canvas, snapshot);
  renderGroundHazards(canvas, snapshot);
  renderBossZoneEffects(canvas, snapshot);
}

export function renderBossZoneEffects(canvas: CanvasRenderingContext2D, snapshot: SceneEffectsSnapshot): void {
  for (const zone of snapshot.bossZones) drawZone(canvas, zone, snapshot);
}
