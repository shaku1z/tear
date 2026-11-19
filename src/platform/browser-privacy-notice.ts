/** What the notice needs from the page, so a test can supply a recording page and storage. */
export interface PrivacyNoticePorts {
  readonly document: Document;
  /** Where the acknowledgement is kept; null when the browser refuses storage. */
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  /** The privacy page the notice links to. */
  readonly privacyUrl: string;
}

export interface PrivacyNotice {
  /** True once the player has pressed OK (kept across visits, and for this visit even if storage fails). */
  acknowledged(): boolean;
  /** Shows the notice if it is due; does nothing when it was already acknowledged or is already open. */
  showIfDue(): void;
}

/**
 * The notice's own version. Changing what the notice says that matters (a new kind of data, a new
 * recipient) means raising this, so every player sees the new text once.
 */
export const PRIVACY_NOTICE_VERSION = "1";
export const PRIVACY_NOTICE_KEY = "tear_privacy_notice";
export const PRIVACY_NOTICE_ID = "tear-privacy-notice";

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

const BUTTON_STYLE = [
  "align-self:flex-start",
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

function paragraph(document: Document, text: string): HTMLElement {
  const element = document.createElement("p");
  element.textContent = text;
  element.style.cssText = "margin:0";
  return element;
}

export function createPrivacyNotice(ports: PrivacyNoticePorts): PrivacyNotice {
  let seen = false;
  const stored = (): boolean => {
    try {
      return ports.storage?.getItem(PRIVACY_NOTICE_KEY) === PRIVACY_NOTICE_VERSION;
    } catch {
      return false;
    }
  };
  const acknowledged = (): boolean => seen || stored();
  return {
    acknowledged,
    showIfDue() {
      const { document } = ports;
      if (acknowledged() || document.getElementById(PRIVACY_NOTICE_ID) !== null) return;
      const backdrop = document.createElement("div");
      backdrop.id = PRIVACY_NOTICE_ID;
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");
      backdrop.setAttribute("aria-labelledby", `${PRIVACY_NOTICE_ID}-title`);
      backdrop.style.cssText = BACKDROP_STYLE;
      // The game listens for keys on the window; while the notice is open they belong to the notice.
      backdrop.addEventListener("keydown", (event) => {
        event.stopPropagation();
      });
      const card = document.createElement("div");
      card.style.cssText = CARD_STYLE;
      const title = document.createElement("h2");
      title.id = `${PRIVACY_NOTICE_ID}-title`;
      title.textContent = "Before you play";
      title.style.cssText = "margin:0;font-size:22px";
      const link = document.createElement("a");
      link.href = ports.privacyUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Read the privacy page";
      link.style.cssText = "color:#13c4d6";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "OK";
      ok.style.cssText = BUTTON_STYLE;
      ok.addEventListener("click", () => {
        seen = true;
        try {
          ports.storage?.setItem(PRIVACY_NOTICE_KEY, PRIVACY_NOTICE_VERSION);
        } catch {
          // The notice was shown and acknowledged for this visit; it will show again next time.
        }
        backdrop.remove();
      });
      card.append(
        title,
        paragraph(document, "Leaderboard names, scores and personal-best replays are public."),
        paragraph(
          document,
          "TEAR also sends anonymous run statistics (mode, difficulty, wave, score and time, with no name or account) to help balance the game. You can turn this off at any time in Settings.",
        ),
        link,
        ok,
      );
      backdrop.append(card);
      document.body.append(backdrop);
      ok.focus();
    },
  };
}
