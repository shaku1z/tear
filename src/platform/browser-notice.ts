/** One button on a notice. Pressing it runs `onPress` and closes the notice. */
export interface NoticeButton {
  readonly label: string;
  readonly onPress?: () => void;
}

/** What a notice says. */
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

/** Where every notice is stacked: one corner, so two notices never cover each other. */
export const NOTICE_STACK_ID = "tear-notices";

/**
 * The stack takes no input of its own (`pointer-events:none`); only a notice inside it does. It sits in the
 * bottom-right corner, which the menus leave empty, so it never covers a control on the first screen.
 */
const STACK_STYLE = [
  "position:fixed",
  "right:16px",
  "bottom:16px",
  "z-index:2147482000",
  "display:flex",
  "flex-direction:column",
  "gap:10px",
  "max-width:min(26em,calc(100vw - 32px))",
  "pointer-events:none",
  "font-family:'Courier New','Nimbus Mono PS','Liberation Mono',monospace",
].join(";");

const NOTICE_STYLE = [
  "display:flex",
  "flex-direction:column",
  "gap:8px",
  "padding:14px 16px",
  "border:2px solid #13c4d6",
  "background:rgba(10,11,16,0.94)",
  "color:#f1eff9",
  "line-height:1.5",
  "font-size:13px",
  "pointer-events:auto",
  "cursor:auto",
].join(";");

const BUTTON_STYLE = [
  "align-self:flex-start",
  "min-width:96px",
  "min-height:36px",
  "padding:6px 18px",
  "border:2px solid #13c4d6",
  "background:#13c4d6",
  "color:#0a0b10",
  "font:inherit",
  "font-weight:bold",
  "letter-spacing:0.08em",
  "cursor:pointer",
].join(";");

function stackIn(document: Document): HTMLElement {
  const existing = document.getElementById(NOTICE_STACK_ID);
  if (existing !== null) return existing;
  const stack = document.createElement("div");
  stack.id = NOTICE_STACK_ID;
  stack.style.cssText = STACK_STYLE;
  document.body.append(stack);
  return stack;
}

/**
 * The page's way to tell the player something. One rule, for every notice: a notice never blocks the first
 * screen. It is a small panel in a corner that takes no focus and no key presses (the game keeps both) and
 * takes pointer input only on itself, so the menu behind it works while it is showing.
 */
export function openNotice(document: Document, spec: NoticeSpec): OpenNotice {
  const notice = document.createElement("section");
  notice.id = spec.id;
  notice.setAttribute("role", "region");
  notice.setAttribute("aria-labelledby", `${spec.id}-title`);
  notice.style.cssText = NOTICE_STYLE;
  const title = document.createElement("h2");
  title.id = `${spec.id}-title`;
  title.textContent = spec.title;
  title.style.cssText = "margin:0;font-size:15px";
  notice.append(title);
  for (const text of spec.paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    paragraph.style.cssText = "margin:0";
    notice.append(paragraph);
  }
  if (spec.link !== undefined) {
    const link = document.createElement("a");
    link.href = spec.link.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = spec.link.label;
    link.style.cssText = "color:#13c4d6";
    notice.append(link);
  }
  const handle: OpenNotice = {
    close() {
      notice.remove();
    },
  };
  for (const definition of spec.buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = definition.label;
    button.style.cssText = BUTTON_STYLE;
    button.addEventListener("click", () => {
      definition.onPress?.();
      handle.close();
    });
    notice.append(button);
  }
  stackIn(document).append(notice);
  return handle;
}
