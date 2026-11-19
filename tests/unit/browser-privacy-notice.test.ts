import { describe, expect, it } from "vitest";
import {
  createPrivacyNotice,
  PRIVACY_NOTICE_ID,
  PRIVACY_NOTICE_KEY,
  PRIVACY_NOTICE_VERSION,
} from "../../src/platform/browser-privacy-notice";
import { fakePage } from "./fake-page";

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

const pressOk = (page: ReturnType<typeof fakePage>): void =>
  page.body.find((element) => element.tag === "button")?.listeners.get("click")?.();

describe("first-run privacy notice", () => {
  it("states what is public, what is anonymous and where to turn it off, with a link to the page", () => {
    const page = fakePage();
    createPrivacyNotice({ document: page.document, storage: fakeStorage(), privacyUrl: "/privacy" }).showIfDue();
    const notice = page.body.find((element) => element.id === PRIVACY_NOTICE_ID);
    expect(notice).toBeDefined();
    const text = notice?.texts().join(" ") ?? "";
    expect(text).toContain("Leaderboard names, scores and personal-best replays are public");
    expect(text).toContain("anonymous run statistics");
    expect(text).toContain("Settings");
    const link = notice?.find((element) => element.tag === "a");
    expect(link?.href).toBe("/privacy");
    expect(link?.rel).toBe("noopener");
    expect(notice?.attributes.get("role")).toBe("dialog");
    expect(notice?.find((element) => element.tag === "button")?.focused).toBe(true);
  });

  it("is not acknowledged until OK is pressed, then is remembered across visits", () => {
    const page = fakePage();
    const storage = fakeStorage();
    const notice = createPrivacyNotice({ document: page.document, storage, privacyUrl: "/privacy" });
    expect(notice.acknowledged()).toBe(false);
    notice.showIfDue();
    pressOk(page);
    expect(notice.acknowledged()).toBe(true);
    expect(storage.values.get(PRIVACY_NOTICE_KEY)).toBe(PRIVACY_NOTICE_VERSION);
    expect(page.body.find((element) => element.id === PRIVACY_NOTICE_ID)).toBeUndefined();

    const later = fakePage();
    const second = createPrivacyNotice({ document: later.document, storage, privacyUrl: "/privacy" });
    second.showIfDue();
    expect(second.acknowledged()).toBe(true);
    expect(later.body.children).toHaveLength(0);
  });

  it("shows again when the notice text version changes", () => {
    const page = fakePage();
    const notice = createPrivacyNotice({
      document: page.document,
      storage: fakeStorage({ [PRIVACY_NOTICE_KEY]: "0" }),
      privacyUrl: "/privacy",
    });
    expect(notice.acknowledged()).toBe(false);
    notice.showIfDue();
    expect(page.body.children).toHaveLength(1);
  });

  it("opens only once at a time", () => {
    const page = fakePage();
    const notice = createPrivacyNotice({ document: page.document, storage: fakeStorage(), privacyUrl: "/privacy" });
    notice.showIfDue();
    notice.showIfDue();
    expect(page.body.children).toHaveLength(1);
  });

  it("counts as acknowledged for this visit when the browser refuses storage", () => {
    const page = fakePage();
    const refusing = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("blocked");
      },
    };
    const notice = createPrivacyNotice({ document: page.document, storage: refusing, privacyUrl: "/privacy" });
    expect(notice.acknowledged()).toBe(false);
    notice.showIfDue();
    pressOk(page);
    expect(notice.acknowledged()).toBe(true);
    expect(page.body.children).toHaveLength(0);
  });
});
