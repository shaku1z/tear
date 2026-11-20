import { describe, expect, it } from "vitest";
import {
  createPrivacyNotice,
  PRIVACY_NOTICE_ID,
  PRIVACY_NOTICE_KEY,
  PRIVACY_NOTICE_VERSION,
} from "../../src/platform/browser-privacy-notice";
import { NOTICE_STACK_ID } from "../../src/platform/browser-notice";

/** The part of an element the notice uses, recorded so a test reads what the player would see. */
class FakeElement {
  id = "";
  type = "";
  href = "";
  target = "";
  rel = "";
  textContent = "";
  readonly style = { cssText: "" };
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  focused = false;
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  append(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }
  remove(): void {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  focus(): void {
    this.focused = true;
  }
  texts(): string[] {
    return [...(this.textContent === "" ? [] : [this.textContent]), ...this.children.flatMap((c) => c.texts())];
  }
  find(predicate: (element: FakeElement) => boolean): FakeElement | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found !== undefined) return found;
    }
    return undefined;
  }
}

function fakePage(): { readonly document: Document; readonly body: FakeElement } {
  const body = new FakeElement("body");
  const document = {
    body,
    createElement: (tag: string) => new FakeElement(tag),
    getElementById: (id: string) => body.find((element) => element.id === id) ?? null,
  } as unknown as Document;
  return { document, body };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

/** How many notices are showing: they are all stacked in one container in the corner. */
const shown = (page: ReturnType<typeof fakePage>): number =>
  page.body.find((element) => element.id === NOTICE_STACK_ID)?.children.length ?? 0;

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
    expect(notice?.attributes.get("role")).toBe("region");
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
    expect(shown(later)).toBe(0);
  });

  it("never blocks the first screen: a corner panel that takes no focus, no keys and no input but its own", () => {
    const page = fakePage();
    createPrivacyNotice({ document: page.document, storage: fakeStorage(), privacyUrl: "/privacy" }).showIfDue();
    const stack = page.body.find((element) => element.id === NOTICE_STACK_ID);
    const notice = page.body.find((element) => element.id === PRIVACY_NOTICE_ID);
    // The container passes every pointer event through to the menu behind it; only the notice takes them.
    expect(stack?.style.cssText).toContain("pointer-events:none");
    expect(notice?.style.cssText).toContain("pointer-events:auto");
    // Not full screen, and tucked into the corner the menus leave empty.
    expect(stack?.style.cssText).not.toContain("inset:0");
    expect(stack?.style.cssText).toMatch(/right:\d+px/u);
    expect(stack?.style.cssText).toMatch(/bottom:\d+px/u);
    // The game keeps the keyboard: nothing is focused and no key handler swallows a key.
    expect(page.body.find((element) => element.focused)).toBeUndefined();
    expect(page.body.find((element) => element.listeners.has("keydown"))).toBeUndefined();
    expect(notice?.attributes.get("aria-modal")).toBeUndefined();
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
    expect(shown(page)).toBe(1);
  });

  it("opens only once at a time", () => {
    const page = fakePage();
    const notice = createPrivacyNotice({ document: page.document, storage: fakeStorage(), privacyUrl: "/privacy" });
    notice.showIfDue();
    notice.showIfDue();
    expect(shown(page)).toBe(1);
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
    expect(shown(page)).toBe(0);
  });
});
