import type { AppScreen } from "../../domain/screen-catalog";
import { RENAME_FIELD } from "../../presentation/rename-field";

export interface RenameSnapshot { readonly active: boolean; readonly error: string; readonly firstRun: boolean;
  readonly previous: AppScreen; readonly value: string }
export interface RenameControllerPorts {
  readonly document: Document; readonly canvas: HTMLCanvasElement; readonly logicalWidth: number;
  readonly overscan: () => Readonly<{ x: number; y: number }>;
  readonly screen: () => AppScreen; readonly replayReturn: () => AppScreen;
  readonly setScreen: (screen: AppScreen, context?: Readonly<{ returnTo: AppScreen }>) => void;
  readonly input: { textEntryMode: boolean };
  readonly profile: { username(): string; usernameSetAt(): number };
  readonly cloud: { loggedIn(): boolean; canRename(): boolean; setCustomUsername(name: string): void };
}
interface ActiveRename { error: string; readonly firstRun: boolean; previous: AppScreen }
const restrictedWords = Object.freeze(["fuck", "shit", "bitch", "nigg", "asshole", "cunt", "faggot", "dick"]);

export class RenameController {
  #active: ActiveRename | null = null;
  #prompted = false;
  constructor(private readonly ports: RenameControllerPorts) {}
  get active(): boolean { return this.#active !== null; }
  get prompted(): boolean { return this.#prompted; }
  markPrompted(): void { this.#prompted = true; }

  begin(firstRun: boolean, debugBypass = false): void {
    if (!debugBypass && !this.ports.cloud.loggedIn()) return;
    this.ports.document.exitPointerLock(); this.ports.input.textEntryMode = true;
    const input = this.#input(); input.value = this.ports.profile.username(); input.style.display = "block"; input.style.color = "#f1eff9";
    this.position(); setTimeout(() => { input.focus(); }, 50);
    const previous = this.ports.screen();
    this.#active = { error: "", firstRun, previous: previous === "rename" ? "profile" : previous };
    this.ports.setScreen("rename");
    // The field owns Enter and Escape: stop them reaching the game's window listener,
    // which would otherwise read them as confirm/back on the screen this returns to.
    input.onkeydown = (event) => {
      if (event.key === "Enter") { event.stopPropagation(); this.submit(); }
      else if (event.key === "Escape") { event.stopPropagation(); this.cancel(); }
    };
  }

  submit(): void {
    if (this.#active === null) return;
    const name = this.#input().value.trim(), error = this.#validate(name);
    if (error !== null) { this.#active.error = error; return; }
    this.ports.cloud.setCustomUsername(name); this.close();
  }
  cancel(): void { if (this.#active !== null) this.close(); }
  close(): void {
    if (this.#active === null) return;
    const input = this.#input(); input.style.display = "none"; input.blur(); input.onkeydown = null;
    this.ports.input.textEntryMode = false;
    const destination = this.#active.previous;
    this.ports.setScreen(destination, destination === "replay" ? { returnTo: this.ports.replayReturn() } : undefined);
    this.#active = null;
  }
  /** Places the DOM field inside the canvas frame using the renderer's shared geometry (RENAME_FIELD). */
  position(): void {
    const input = this.#input(), rect = this.ports.canvas.getBoundingClientRect(), overscan = this.ports.overscan();
    const scale = rect.width / (this.ports.logicalWidth + overscan.x * 2), field = RENAME_FIELD;
    const x = field.x + (this.ports.logicalWidth / 2 - (field.x + field.w / 2)) + field.inset, width = field.w - field.inset - field.counterW;
    input.style.left = String(rect.left + (x + overscan.x) * scale) + "px";
    input.style.top = String(rect.top + (field.y + overscan.y) * scale) + "px";
    input.style.width = String(width * scale) + "px"; input.style.height = String(field.h * scale) + "px";
    input.style.fontSize = String(field.fontSize * scale) + "px";
    input.style.textAlign = "left";
  }
  snapshot(): RenameSnapshot {
    const active = this.#active;
    return Object.freeze({ active: active !== null, error: active?.error ?? "", firstRun: active?.firstRun ?? false,
      previous: active?.previous ?? "settings", value: this.#input().value.trim() });
  }
  #input(): HTMLInputElement {
    const input = this.ports.document.getElementById("nameInput");
    if (!(input instanceof HTMLInputElement)) throw new TypeError("#nameInput must be an input element");
    return input;
  }
  #validate(name: string): string | null {
    if (name.length < 3 || name.length > 16) return "Must be 3-16 characters";
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return "Letters, numbers, spaces, _, - only";
    const lower = name.toLowerCase();
    if (restrictedWords.some((word) => lower.includes(word))) return "Name contains restricted words";
    if (this.ports.profile.usernameSetAt() && !this.ports.cloud.canRename()) return "You can only change your name once every 7 days.";
    return null;
  }
}
