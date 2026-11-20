import { openNotice } from "./browser-notice";

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
      openNotice(document, {
        id: PRIVACY_NOTICE_ID,
        title: "Before you play",
        paragraphs: [
          "Leaderboard names, scores and personal-best replays are public.",
          "TEAR also sends anonymous run statistics (mode, difficulty, wave, score and time, with no name or account) to help balance the game. You can turn this off at any time in Settings.",
        ],
        link: { href: ports.privacyUrl, label: "Read the privacy page" },
        buttons: [
          {
            label: "OK",
            onPress: () => {
              seen = true;
              try {
                ports.storage?.setItem(PRIVACY_NOTICE_KEY, PRIVACY_NOTICE_VERSION);
              } catch {
                // The notice was shown and acknowledged for this visit; it will show again next time.
              }
            },
          },
        ],
      });
    },
  };
}
