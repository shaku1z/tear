export interface LogicalInsets {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface LogicalOverscan {
  x: number;
  y: number;
}

/** Owns the browser-to-logical-pixel transform and its two lifetime listeners. */
export class CanvasViewport {
  #started = false;
  #cssPerLogicalPixel = 1;
  readonly #resizeListener = () => { this.resize(); };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly logicalWidth: number,
    private readonly logicalHeight: number,
    private readonly overscan: LogicalOverscan,
    private readonly safeArea: LogicalInsets,
    private readonly browserWindow: Window = window,
    private readonly browserDocument: Document = document,
  ) {}

  get cssPerLogicalPixel(): number {
    return this.#cssPerLogicalPixel;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.browserWindow.addEventListener("resize", this.#resizeListener);
    this.browserDocument.addEventListener("fullscreenchange", this.#resizeListener);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(this.browserWindow.devicePixelRatio || 1, 2.5);
    const clientWidth = this.canvas.clientWidth || this.logicalWidth;
    const clientHeight = this.canvas.clientHeight || this.logicalHeight;
    const backingWidth = Math.max(2, Math.round(clientWidth * dpr));
    const backingHeight = Math.max(2, Math.round(clientHeight * dpr));
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
    const scale = Math.min(backingWidth / this.logicalWidth, backingHeight / this.logicalHeight);
    this.overscan.x = Math.max(0, (backingWidth / scale - this.logicalWidth) / 2);
    this.overscan.y = Math.max(0, (backingHeight / scale - this.logicalHeight) / 2);
    this.#cssPerLogicalPixel = scale / dpr;

    const probe = this.browserDocument.getElementById("safeprobe");
    if (probe === null) return;
    const style = this.browserWindow.getComputedStyle(probe);
    const toLogical = dpr / scale;
    this.safeArea.t = (Number.parseFloat(style.paddingTop) || 0) * toLogical;
    this.safeArea.r = (Number.parseFloat(style.paddingRight) || 0) * toLogical;
    this.safeArea.b = (Number.parseFloat(style.paddingBottom) || 0) * toLogical;
    this.safeArea.l = (Number.parseFloat(style.paddingLeft) || 0) * toLogical;
  }

  dispose(): void {
    if (!this.#started) return;
    this.#started = false;
    this.browserWindow.removeEventListener("resize", this.#resizeListener);
    this.browserDocument.removeEventListener("fullscreenchange", this.#resizeListener);
  }
}
