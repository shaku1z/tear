import { formatBuildLabel, type BuildIdentity } from "./build-identity";

/** What the error screen needs from the page, so a test can supply a recording page. */
export interface ErrorScreenPorts {
  readonly document: Document;
  readonly build: BuildIdentity;
  readonly reload: () => void;
  /** The local error report: where the full error goes. Nothing is sent anywhere. */
  readonly report: (error: unknown) => void;
}

/** The error element's id: one screen per page, however many faults arrive. */
export const ERROR_SCREEN_ID = "tear-error-screen";

const DETAIL_LIMIT = 240;
const ABOVE_EVERYTHING = "2147483000";

const SCREEN_STYLE = [
  "position:fixed",
  "inset:0",
  `z-index:${ABOVE_EVERYTHING}`,
  "display:flex",
  "flex-direction:column",
  "align-items:center",
  "justify-content:center",
  "gap:18px",
  "padding:24px",
  "box-sizing:border-box",
  "background:#0a0b10",
  "color:#f1eff9",
  "font-family:'Courier New','Nimbus Mono PS','Liberation Mono',monospace",
  "text-align:center",
  "cursor:auto",
].join(";");

const BUTTON_STYLE = [
  "min-width:160px",
  "min-height:44px",
  "padding:10px 24px",
  "border:2px solid #13c4d6",
  "background:#13c4d6",
  "color:#0a0b10",
  "font:inherit",
  "font-weight:bold",
  "letter-spacing:0.08em",
  "cursor:pointer",
].join(";");

/** The first line of the error, short enough to read aloud to someone helping. */
export function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const line = text.split("\n")[0] ?? "";
  return line.length > DETAIL_LIMIT ? `${line.slice(0, DETAIL_LIMIT - 1)}…` : line;
}

function paragraph(document: Document, text: string, style: string): HTMLElement {
  const element = document.createElement("p");
  element.textContent = text;
  element.style.cssText = `margin:0;max-width:34em;line-height:1.6;${style}`;
  return element;
}

/**
 * Replaces the page with a plain error screen: what happened, RELOAD, and the build. It is page
 * markup, not canvas drawing, because the canvas is what stopped. The screen shows only the first
 * line of the error; the full report goes through `report`.
 */
export function showErrorScreen(ports: ErrorScreenPorts, error: unknown): void {
  const { document } = ports;
  if (document.getElementById(ERROR_SCREEN_ID) !== null) return;
  const screen = document.createElement("div");
  screen.id = ERROR_SCREEN_ID;
  screen.setAttribute("role", "alertdialog");
  screen.setAttribute("aria-labelledby", `${ERROR_SCREEN_ID}-title`);
  screen.style.cssText = SCREEN_STYLE;
  const title = paragraph(document, "TEAR stopped unexpectedly", "font-size:28px;font-weight:bold");
  title.id = `${ERROR_SCREEN_ID}-title`;
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "RELOAD";
  reload.style.cssText = BUTTON_STYLE;
  reload.addEventListener("click", ports.reload);
  screen.append(
    title,
    paragraph(
      document,
      "Something went wrong and the game cannot continue. Reload to start again; progress saved before this point stays on this device.",
      "font-size:15px;color:#c9ccd6",
    ),
    reload,
    paragraph(document, describeError(error), "font-size:12px;color:#8e91a0;word-break:break-word"),
    paragraph(document, formatBuildLabel(ports.build), "font-size:12px;color:#8e91a0"),
  );
  document.body.append(screen);
  reload.focus();
}

/**
 * The frame loop's fault handler: report the error locally, then show the screen. It never throws,
 * because it runs when something already has; if the page cannot show the screen, the report remains.
 */
export function createFrameFaultHandler(ports: ErrorScreenPorts): (error: unknown) => void {
  return (error) => {
    try {
      ports.report(error);
    } catch {
      // The report is best effort; the screen still shows.
    }
    try {
      showErrorScreen(ports, error);
    } catch {
      // Nothing more can be shown; the report above is what is left.
    }
  };
}
