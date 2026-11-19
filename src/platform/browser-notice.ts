/** One button on a notice. Pressing it runs `onPress` and closes the notice. */
export interface NoticeButton {
  readonly label: string;
  readonly onPress?: () => void;
}

/** What a notice says. The first button is the one the focus starts on. */
export interface NoticeSpec {
  /** The element id; one notice per id is open at a time. */
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly link?: Readonly<{ href: string; label: string }>;
  readonly buttons: readonly NoticeButton[];
}

export interface OpenNotice {
  close(): void;
}

const BACKDROP_STYLE = [
  "position:fixed",
  "inset:0",
  "z-index:2147482000",
  "display:flex",
  "align-items:center",
  "justify-content:center",
  "padding:24px",
  "box-sizing:border-box",
  "background:rgba(10,11,16,0.9)",
  "color:#f1eff9",
  "font-family:'Courier New','Nimbus Mono PS','Liberation Mono',monospace",
  "cursor:auto",
].join(";");

const CARD_STYLE = [
  "max-width:36em",
  "display:flex",
  "flex-direction:column",
  "gap:14px",
  "padding:28px",
  "border:2px solid #13c4d6",
  "background:#0a0b10",
  "line-height:1.6",
  "font-size:15px",
].join(";");

const BUTTON_ROW_STYLE = "display:flex;flex-wrap:wrap;gap:12px";

const BUTTON_STYLE = [
  "min-width:140px",
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

/**
 * The page's own dialog for something the player must read before going on: a full-screen card over the
 * game, drawn with DOM elements like the crash screen so it works when the canvas UI is not running.
 * The game listens for keys on the window; while a notice is open they belong to the notice.
 */
export function openNotice(document: Document, spec: NoticeSpec): OpenNotice {
  const backdrop = document.createElement("div");
  backdrop.id = spec.id;
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", `${spec.id}-title`);
  backdrop.style.cssText = BACKDROP_STYLE;
  backdrop.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
  const card = document.createElement("div");
  card.style.cssText = CARD_STYLE;
  const title = document.createElement("h2");
  title.id = `${spec.id}-title`;
  title.textContent = spec.title;
  title.style.cssText = "margin:0;font-size:22px";
  card.append(title);
  for (const text of spec.paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    paragraph.style.cssText = "margin:0";
    card.append(paragraph);
  }
  if (spec.link !== undefined) {
    const link = document.createElement("a");
    link.href = spec.link.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = spec.link.label;
    link.style.cssText = "color:#13c4d6";
    card.append(link);
  }
  const row = document.createElement("div");
  row.style.cssText = BUTTON_ROW_STYLE;
  const handle: OpenNotice = {
    close() {
      backdrop.remove();
    },
  };
  const buttons = spec.buttons.map((definition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = definition.label;
    button.style.cssText = BUTTON_STYLE;
    button.addEventListener("click", () => {
      definition.onPress?.();
      handle.close();
    });
    return button;
  });
  row.append(...buttons);
  card.append(row);
  backdrop.append(card);
  document.body.append(backdrop);
  buttons[0]?.focus();
  return handle;
}
