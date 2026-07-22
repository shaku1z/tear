import { describe, expect, it, vi } from "vitest";
import { AchievementToastController } from "../../src/app/achievement-toast-controller";
import { TouchOnboardingController } from "../../src/app/touch-onboarding-controller";

describe("presentation state controllers", () => {
  it("queues achievement toasts and records them as seen", () => {
    const markSeen = vi.fn(), save = vi.fn(), pending = [{ id: "a", name: "A", desc: "done", rarity: "common", cat: "combat" }];
    const snapshot = new AchievementToastController((value) => value).step(0.2, { pending,
      rarities: {}, commonRarity: { name: "COMMON", color: "#fff" }, categories: { combat: { icon: "!" } },
      markSeen, save, shardsFor: () => 2, coinsFor: () => 3 });
    expect(snapshot).toMatchObject({ name: "A", reveal: 0.5, shards: 2, coins: 3 });
    expect(markSeen).toHaveBeenCalledWith("a");
    expect(save).toHaveBeenCalledOnce();
  });

  it("finishes touch onboarding after seven seconds", () => {
    const controller = new TouchOnboardingController();
    expect(controller.step(6.5, false)).toEqual({ alpha: 0.5, completed: false });
    expect(controller.step(0.5, false)).toEqual({ alpha: 0, completed: true });
  });
});
