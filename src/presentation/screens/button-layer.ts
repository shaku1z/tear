export interface CanvasUiButton {
  x: number; y: number; w: number; h: number;
  label: string; enabled?: boolean; sel?: boolean; chip?: boolean;
  glyph?: string; sub?: string; pips?: Readonly<{ n: number; filled: number; color: string }>;
  _hideBox?: boolean; _k?: string; _a?: number;
  readonly [key: string]: unknown;
}

export interface ButtonLayerUiPort {
  pointIn(button: CanvasUiButton, x: number, y: number): boolean;
  chip(context: CanvasRenderingContext2D, button: CanvasUiButton, active: boolean): void;
  button(context: CanvasRenderingContext2D, button: CanvasUiButton, active: boolean): void;
}

export interface ButtonLayerOptions {
  readonly context: CanvasRenderingContext2D;
  readonly buttons: readonly CanvasUiButton[];
  readonly focus: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly pointerActive: boolean;
  readonly deltaSeconds: number;
  readonly enterSeconds: number;
  readonly hoverAnimation: Record<string, number>;
  readonly ui: ButtonLayerUiPort;
  readonly entranceEase: (amount: number) => number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function renderButtonLayer(options: ButtonLayerOptions): void {
  const { context, buttons, hoverAnimation, ui } = options;
  const smoothing = clamp(12 * options.deltaSeconds, 0, 1);
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons[index];
    if (button === undefined || button._hideBox) continue;
    const hovered = options.pointerActive && ui.pointIn(button, options.pointerX, options.pointerY) && button.enabled !== false;
    const active = hovered || Boolean(button.sel) || index === options.focus;
    const key = button._k ?? `${button.label}@${String(Math.round(button.x))},${String(Math.round(button.y))}`;
    button._k = key;
    const progress = hoverAnimation[key] = lerp(hoverAnimation[key] ?? 0, active ? 1 : 0, smoothing);
    button._a = progress;
    const entrance = options.entranceEase((options.enterSeconds - index * 0.025) / 0.2);
    context.save();
    context.globalAlpha = entrance;
    const centerX = button.x + button.w / 2;
    const centerY = button.y + button.h / 2;
    const scale = button.glyph || button.sub || button.pips ? 1 : 1 + progress * 0.04;
    context.translate(centerX, centerY + (1 - entrance) * 14);
    context.scale(scale, scale);
    context.translate(-centerX, -centerY);
    if (button.chip) ui.chip(context, button, active);
    else ui.button(context, button, active);
    context.restore();
  }
}
