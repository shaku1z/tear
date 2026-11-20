// Mobile is paused (owner, 2026-11-19; plans/MOBILE_LATER.md): production builds leave the
// mobile modules out and show one plain line on a device whose only pointer is a finger.
import { describe, expect, it } from "vitest";
import { BUILD_TARGETS, BUILD_TARGET_NAMES } from "../../scripts/build-targets.mjs";
import { MOBILE_ONLY_ROLE, loadRoleMatcher, roleModulesInBundle } from "../../scripts/release-developer-code.mjs";
import { touchOnlyDevice } from "../../src/domain/pointer-ownership";
import { COMPUTER_ONLY_CLASS, waitForComputerInput } from "../../src/entrypoints/computer-only";

interface Pointers {
  coarse: boolean;
  fine: boolean;
}

function media(pointers: Pointers) {
  return (query: string) => ({
    matches:
      (query === "(any-pointer: coarse)" && pointers.coarse) || (query === "(any-pointer: fine)" && pointers.fine),
  });
}

describe("which devices production builds turn away", () => {
  it("turns away only a device whose every pointer is coarse", () => {
    expect(touchOnlyDevice(media({ coarse: true, fine: false })), "phone or tablet").toBe(true);
    expect(touchOnlyDevice(media({ coarse: true, fine: true })), "touchscreen laptop").toBe(false);
    expect(touchOnlyDevice(media({ coarse: false, fine: true })), "desktop").toBe(false);
    expect(touchOnlyDevice(media({ coarse: false, fine: false })), "no pointer: a TV with a controller").toBe(false);
  });

  it("lets a device through when its media queries cannot be read", () => {
    expect(touchOnlyDevice(undefined)).toBe(false);
    expect(
      touchOnlyDevice(() => {
        throw new Error("blocked");
      }),
    ).toBe(false);
  });
});

/** A window and document just large enough for the gate: media queries, events and #boot. */
function fakePage(pointers: Pointers) {
  const pointerListeners = new Set<() => void>();
  const windowListeners = new Map<string, Set<() => void>>();
  const classes = new Set<string>();
  const window = {
    matchMedia: (query: string) => ({
      ...media(pointers)(query),
      addEventListener: (_type: string, listener: () => void) => pointerListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => pointerListeners.delete(listener),
    }),
    addEventListener: (type: string, listener: () => void) => {
      const set = windowListeners.get(type) ?? new Set();
      set.add(listener);
      windowListeners.set(type, set);
    },
    removeEventListener: (type: string, listener: () => void) => windowListeners.get(type)?.delete(listener),
  };
  const boot = {
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
  };
  const document = { getElementById: (id: string) => (id === "boot" ? boot : null) };
  return {
    window: window as unknown as Window,
    document: document as unknown as Document,
    classes,
    plugMouse() {
      pointers.fine = true;
      for (const listener of [...pointerListeners]) listener();
    },
    connectPad() {
      for (const listener of [...(windowListeners.get("gamepadconnected") ?? [])]) listener();
    },
    listening: () => pointerListeners.size + (windowListeners.get("gamepadconnected")?.size ?? 0),
  };
}

const settled = async (promise: Promise<void>): Promise<boolean> => {
  let done = false;
  void promise.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

describe("the computer-only screen", () => {
  it("starts at once on a computer and never shows the line", async () => {
    const page = fakePage({ coarse: true, fine: true });
    expect(await settled(waitForComputerInput(page.window, page.document))).toBe(true);
    expect(page.classes.has(COMPUTER_ONLY_CLASS)).toBe(false);
  });

  it("holds a phone on the line until a mouse is plugged in, then starts and stops listening", async () => {
    const page = fakePage({ coarse: true, fine: false });
    const gate = waitForComputerInput(page.window, page.document);
    expect(await settled(gate)).toBe(false);
    expect(page.classes.has(COMPUTER_ONLY_CLASS)).toBe(true);
    page.plugMouse();
    expect(await settled(gate)).toBe(true);
    expect(page.classes.has(COMPUTER_ONLY_CLASS)).toBe(false);
    expect(page.listening()).toBe(0);
  });

  it("starts a phone when a controller connects", async () => {
    const page = fakePage({ coarse: true, fine: false });
    const gate = waitForComputerInput(page.window, page.document);
    page.connectPad();
    expect(await settled(gate)).toBe(true);
    expect(page.listening()).toBe(0);
  });
});

describe("mobile modules in a production bundle", () => {
  const isMobileOnly = loadRoleMatcher(MOBILE_ONLY_ROLE);

  it("keeps mobile out of every production target", () => {
    for (const name of BUILD_TARGET_NAMES) expect(BUILD_TARGETS[name].mobile, name).toBe(false);
  });

  it("names the touch input, the touch controls, the rotate gate and the phone profile as mobile-only", () => {
    for (const file of [
      "src/input/browser-touch.ts",
      "src/input/touch-control-layout.ts",
      "src/presentation/world/touch-controls.ts",
      "src/presentation/rotate-gate.ts",
      "src/presentation/screens/compact-profile.ts",
      "src/app/training/touch-onboarding-controller.ts",
    ])
      expect(isMobileOnly(file), file).toBe(true);
  });

  it("does not name the shared desktop input, the gamepad or the PWA", () => {
    for (const file of [
      "src/input/browser-input.ts",
      "src/input/browser-gamepad.ts",
      "src/platform/pwa-update.ts",
      "src/presentation/screens/compact-page.ts",
      "src/domain/pointer-ownership.ts",
    ])
      expect(isMobileOnly(file), file).toBe(false);
  });

  it("reports a mobile module that ships code, and not one the bundler shook down to nothing", () => {
    expect(
      roleModulesInBundle(
        [
          ["/repo/src/input/browser-touch.ts", 4000],
          ["/repo/src/presentation/rotate-gate.ts", 0],
          ["/repo/src/input/browser-input.ts", 9000],
        ],
        isMobileOnly,
      ),
    ).toEqual(["src/input/browser-touch.ts"]);
  });
});
