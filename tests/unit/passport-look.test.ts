import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProfileScreenView, ScreenControl, ScreenRenderContext } from "../../src/presentation/screens/contracts";
import { createProfileAchievementRenderers } from "../../src/presentation/screens/profile-achievements";

/**
 * The Profile screen with nothing worn must draw exactly what it drew before titles and banners: the committed
 * list of UI and canvas calls was recorded from that renderer. Regenerate it only for a deliberate change to
 * the passport's own look: TEAR_PASSPORT_DRAW_WRITE=1 pnpm exec vitest run tests/unit/passport-look.test.ts
 */
const FIXTURE = new URL("../fixtures/passport-default-draw-calls.json", import.meta.url);

const round = (value: unknown): unknown => (typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value);
const show = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) => (typeof entry === "function" ? String(entry) : round(entry)));

/**
 * A stand-in for any value the renderer reads from the UI: every property is another stand-in and it reads
 * as one fixed number, so layout arithmetic runs the same way on every renderer it is given to.
 */
function token(path: string): unknown {
  const read = (): number => path.length;
  return new Proxy(read, {
    get: (_target, key) => {
      if (key === Symbol.toPrimitive) return read;
      if (key === "toString" || key === "valueOf") return () => read();
      return typeof key === "string" ? token(`${path}.${key}`) : undefined;
    },
  });
}

/** A UI and a canvas that log every call in order; the UI's measuring calls give fixed, plain answers. */
function recorder() {
  const calls: string[] = [];
  const log = (name: string, args: readonly unknown[]): void => {
    calls.push(`${name}(${args.map(show).join(",")})`);
  };
  const canvasTarget: Record<string | symbol, unknown> = {};
  const canvas = new Proxy(canvasTarget, {
    get: (target, key) => {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      if (key === "measureText") return (text: string) => ({ width: text.length * 8 });
      return (...args: unknown[]) => {
        log(`canvas.${key}`, args);
      };
    },
    set: (target, key, value: unknown) => {
      if (typeof key === "string") log(`canvas.${key}=`, [value]);
      target[key] = value;
      return true;
    },
  });
  const answers: Readonly<Record<string, (...args: never[]) => unknown>> = {
    fitText: (_canvas: never, text: string, _width: number, options: { size: number }) => ({
      lines: [text],
      size: options.size,
    }),
    badge: () => 40,
    readable: (color: string) => color,
  };
  const ui = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (typeof key !== "string") return undefined;
        if (key === "ink") return "#000";
        if (key === "density") return { touch: false, compact: false };
        if (key === "t") return token("t");
        return (...args: unknown[]) => {
          log(`ui.${key}`, args.slice(1));
          const answer = answers[key];
          return answer ? answer(...(args as never[])) : token(`ui.${key}`);
        };
      },
    },
  );
  const controls: ScreenControl[] = [];
  const context = {
    canvas,
    ui,
    width: 1600,
    height: 900,
    time: 0,
    enterAmount: 1,
    enterSeconds: 1,
    deltaSeconds: 1 / 60,
    mouse: { x: -1, y: -1 },
    scroll: 0,
    focus: 0,
    touch: false,
    reducedMotion: false,
    pixelScale: 1,
    screenRectangle: { x: 0, y: 0, w: 1600, h: 900 },
    safeInsets: { l: 0, r: 0, t: 0, b: 0 },
    enqueue(control: ScreenControl): void {
      controls.push(control);
      log("enqueue", [control]);
    },
  } as unknown as ScreenRenderContext;
  return { calls, context };
}

const PASSPORT: NonNullable<ProfileScreenView["passport"]> = {
  coins: 1234,
  shards: 56,
  achievements: "3 / 40",
  canRename: true,
  renameLabel: "CHANGE NAME",
  canSignIn: false,
  canSignOut: true,
  showcases: [{ glyph: "★", color: "#e0a326" }],
};
const VIEWS: Readonly<Record<string, ProfileScreenView>> = {
  signedIn: {
    id: "profile",
    tab: "bests",
    tabs: [{ id: "bests", label: "BESTS", selected: true }],
    name: "Rootcutter",
    signedIn: true,
    cloudStatus: "Signed in — progress synced",
    stats: [],
    passport: PASSPORT,
  },
  guest: {
    id: "profile",
    tab: "stats",
    tabs: [{ id: "stats", label: "STATS", selected: true }],
    name: "GUEST",
    signedIn: false,
    cloudStatus: "Progress saved on this device",
    stats: [],
    passport: { ...PASSPORT, canRename: false, canSignIn: true, canSignOut: false, showcases: [] },
  },
};
function draw(view: ProfileScreenView): string[] {
  const { calls, context } = recorder();
  createProfileAchievementRenderers(context).profile(view);
  return calls;
}

describe("profile passport look", () => {
  it("draws today's passport, call for call, while nothing is worn", () => {
    const recorded = Object.fromEntries(Object.entries(VIEWS).map(([name, view]) => [name, draw(view)]));
    if (process.env.TEAR_PASSPORT_DRAW_WRITE === "1") writeFileSync(FIXTURE, `${JSON.stringify(recorded, null, 1)}\n`);
    const expected: unknown = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(recorded).toEqual(expected);
  });

  it("puts a worn title on its own line under the name, and moves the lines below it down", () => {
    const plain = draw(VIEWS.signedIn ?? fail());
    const titled = draw(withLook({ title: "GIANT SLAYER" }));
    const title = titled.find((call) => call.startsWith('ui.textBox("GIANT SLAYER"'));
    expect(title).toBeDefined();
    expect(plain.some((call) => call.includes('"GIANT SLAYER"'))).toBe(false);
    const cloud = (calls: readonly string[]) => calls.find((call) => call.startsWith('ui.textBox("Signed in'));
    expect(cloud(titled)).not.toEqual(cloud(plain));
  });

  it("draws a worn banner as a band along the top edge first, and gives the spine its second colour", () => {
    const calls = draw(withLook({ banner: { colors: ["#2f9e6b", "#7a4ff0"], pattern: "split" } }));
    const bandFills = calls.filter(
      (call) => call === 'canvas.fillStyle=("#2f9e6b")' || call === 'canvas.fillStyle=("#7a4ff0")',
    );
    expect(bandFills).toEqual(['canvas.fillStyle=("#2f9e6b")', 'canvas.fillStyle=("#7a4ff0")']);
    const spine = calls.find((call) => call.startsWith("ui.spine("));
    expect(spine).toContain('"#7a4ff0"');
    const firstBand = calls.indexOf('canvas.fillStyle=("#2f9e6b")'),
      name = calls.findIndex((call) => call.startsWith("ui.displayText("));
    expect(firstBand).toBeLessThan(name);
  });
});

function withLook(look: NonNullable<NonNullable<ProfileScreenView["passport"]>["look"]>): ProfileScreenView {
  const view = VIEWS.signedIn ?? fail();
  return { ...view, passport: { ...PASSPORT, look } };
}
function fail(): never {
  throw new Error("missing view fixture");
}
