import { describe, expect, it } from "vitest";

import { discardScenePresses } from "../../src/input/scene-release";

function input() {
  return {
    pressed: new Set(["Space", "KeyW", "ArrowUp", "ShiftLeft", "Enter"]),
    held: new Set(["KeyD", "Space"]),
    tJump: true,
    tDash: true,
    rmb: true,
    clicked: true,
    takeClick() {
      const had = this.clicked;
      this.clicked = false;
      return had ? { x: 0, y: 0 } : null;
    },
  };
}

describe("the press that ends a scene belongs to the scene", () => {
  it("drops every waiting press: keyboard, touch, controller and mouse", () => {
    const state = input();
    discardScenePresses(state);
    expect([...state.pressed], "keyboard jump and dash keys").toEqual([]);
    expect(state.tJump, "touch or controller jump").toBe(false);
    expect(state.tDash, "touch or controller dash").toBe(false);
    expect(state.rmb, "throw: right mouse, touch button or controller").toBe(false);
    expect(state.clicked, "mouse click or tap").toBe(false);
  });

  it("keeps what is held, so a direction already held moves the player at once", () => {
    const state = input();
    discardScenePresses(state);
    expect([...state.held]).toEqual(["KeyD", "Space"]);
  });
});
