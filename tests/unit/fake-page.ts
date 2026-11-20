/** The part of an element the notice uses, recorded so a test reads what the player would see. */
export class FakeElement {
  id = "";
  type = "";
  href = "";
  target = "";
  rel = "";
  textContent = "";
  readonly style = { cssText: "", display: "" };
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

export function fakePage(): { readonly document: Document; readonly body: FakeElement } {
  const body = new FakeElement("body");
  const document = {
    body,
    createElement: (tag: string) => new FakeElement(tag),
    getElementById: (id: string) => body.find((element) => element.id === id) ?? null,
  } as unknown as Document;
  return { document, body };
}
