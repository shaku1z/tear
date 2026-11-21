import { describe, expect, it } from "vitest";
import {
  ARMED_CONFIRM_DELAY_MS,
  ARMED_CONFIRM_EXPIRY_MS,
  createArmedConfirm,
} from "../../src/app/interface/armed-confirm";

function harness() {
  let now = 1000;
  return {
    confirm: createArmedConfirm(() => now),
    wait: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

describe("armed confirm", () => {
  it("only asks on the first press, ignores a quick second one, and confirms a deliberate one", () => {
    const { confirm, wait } = harness();
    expect(confirm.press("a")).toBe(false);
    expect(confirm.view("a")).toEqual({ armed: true, confirmable: false });
    wait(ARMED_CONFIRM_DELAY_MS - 1);
    expect(confirm.press("a")).toBe(false);
    wait(1);
    expect(confirm.press("a")).toBe(true);
    expect(confirm.view("a")).toEqual({ armed: false, confirmable: false });
  });

  it("asks again for another target instead of confirming the first", () => {
    const { confirm, wait } = harness();
    confirm.press("a");
    wait(ARMED_CONFIRM_DELAY_MS);
    expect(confirm.press("b")).toBe(false);
    expect(confirm.view("a").armed).toBe(false);
    expect(confirm.view("b").armed).toBe(true);
  });

  it("disarms by itself after a while, and on cancel", () => {
    const { confirm, wait } = harness();
    confirm.press("a");
    wait(ARMED_CONFIRM_EXPIRY_MS + 1);
    expect(confirm.view("a").armed).toBe(false);
    expect(confirm.press("a")).toBe(false);
    confirm.cancel();
    expect(confirm.view("a").armed).toBe(false);
  });
});
