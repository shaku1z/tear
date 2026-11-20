import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppScreen } from "../../src/domain/screen-catalog";
import { MAX_PLAYER_NAME, MIN_PLAYER_NAME } from "../../src/domain/display-names";
import { RenameController, type RenameControllerPorts } from "../../src/app/screens/rename-controller";

/** The DOM field the controller drives, standing in for <input id="nameInput"> in a node test. */
class FakeInput {
  value = "";
  maxLength = MAX_PLAYER_NAME;
  readonly style: Record<string, string> = {};
  onkeydown: unknown = null;
  readonly focus = (): void => undefined;
  readonly blur = (): void => undefined;
}

function harness(options: Readonly<{ loggedIn?: boolean; setAt?: number; canRename?: boolean }> = {}) {
  const input = new FakeInput();
  let screen: AppScreen = "profile";
  const renamed: string[] = [];
  const ports = {
    document: { getElementById: () => input, exitPointerLock: () => undefined, pointerLockElement: null },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }) },
    logicalWidth: 1600,
    overscan: () => ({ x: 0, y: 0 }),
    screen: () => screen,
    replayReturn: () => "menu" as AppScreen,
    setScreen: (next: AppScreen) => {
      screen = next;
    },
    input: { textEntryMode: false },
    profile: { username: () => "Wanderer", usernameSetAt: () => options.setAt ?? 0 },
    cloud: {
      loggedIn: () => options.loggedIn ?? true,
      canRename: () => options.canRename ?? true,
      setCustomUsername: (name: string) => {
        renamed.push(name);
      },
    },
  } as unknown as RenameControllerPorts;
  return { controller: new RenameController(ports), input, renamed, screen: () => screen };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("HTMLInputElement", FakeInput);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("name entry", () => {
  it("opens on the player name with the player limits, and saves it to the account", () => {
    const { controller, input, renamed, screen } = harness();
    controller.begin(false);
    expect(controller.snapshot()).toMatchObject({
      active: true,
      subject: "player",
      value: "Wanderer",
      minLength: MIN_PLAYER_NAME,
      maxLength: MAX_PLAYER_NAME,
    });
    expect(input.maxLength).toBe(MAX_PLAYER_NAME);
    input.value = "  Blade Runner ";
    controller.submit();
    expect(renamed).toEqual(["Blade Runner"]);
    expect(screen()).toBe("profile");
  });

  it("keeps the player name rules: length, characters, restricted words, then the weekly limit", () => {
    const { controller, input, renamed } = harness({ setAt: 5, canRename: false });
    controller.begin(false);
    for (const [name, problem] of [
      ["ab", "Must be 3-16 characters"],
      ["no/slashes", "Letters, numbers, spaces, _, - only"],
      ["shithead", "Name contains restricted words"],
      ["Fine Name", "You can only change your name once every 7 days."],
    ] as const) {
      input.value = name;
      controller.submit();
      expect(controller.snapshot().error).toBe(problem);
    }
    expect(renamed).toEqual([]);
  });

  it("does not open for a signed-out player without the debug bypass", () => {
    const { controller } = harness({ loggedIn: false });
    controller.begin(false);
    expect(controller.active).toBe(false);
    controller.begin(false, true);
    expect(controller.active).toBe(true);
  });

  it("names another target with its own limits and commit, leaving the account alone", () => {
    const { controller, input, renamed } = harness();
    const committed: string[] = [];
    controller.beginNaming({
      subject: "loadout",
      initial: "LOADOUT 2",
      minLength: 1,
      maxLength: 24,
      commit: (name) => {
        committed.push(name);
      },
    });
    expect(controller.snapshot()).toMatchObject({
      subject: "loadout",
      value: "LOADOUT 2",
      minLength: 1,
      maxLength: 24,
    });
    expect(input.maxLength).toBe(24);
    input.value = "x".repeat(25);
    controller.submit();
    expect(controller.snapshot().error).toBe("Must be 1-24 characters");
    input.value = "Boss runs";
    controller.submit();
    expect(committed).toEqual(["Boss runs"]);
    expect(renamed).toEqual([]);
    expect(controller.active).toBe(false);
  });
});
