import { describe, expect, it, vi } from "vitest";
import { AchievementToastController, achievementToastHeld } from "../../src/app/interface/achievement-toast-controller";
import { TouchOnboardingController } from "../../src/app/training/touch-onboarding-controller";

describe("presentation state controllers", () => {
  it("queues achievement toasts and records them as seen", () => {
    const markSeen = vi.fn(),
      save = vi.fn(),
      pending = [{ id: "a", name: "A", desc: "done", rarity: "common", cat: "combat" }];
    const snapshot = new AchievementToastController((value) => value).step(0.2, {
      pending,
      rarities: {},
      commonRarity: { name: "COMMON", color: "#fff" },
      categories: { combat: { icon: "!" } },
      markSeen,
      save,
      shardsFor: () => 2,
      coinsFor: () => 3,
    });
    expect(snapshot).toMatchObject({ name: "A", reveal: 0.5, shards: 2, coins: 3 });
    expect(markSeen).toHaveBeenCalledWith("a");
    expect(save).toHaveBeenCalledOnce();
  });

  it("holds achievement toasts while a replay plays: the toast stays queued and shows after", () => {
    const held = (name: string) => achievementToastHeld({ name, cinematic: false, bossIntro: false });
    expect(held("replay")).toBe(true);
    expect(held("playing")).toBe(false);
    expect(held("menu")).toBe(false);
    expect(achievementToastHeld({ name: "playing", cinematic: true, bossIntro: false })).toBe(true);
    expect(achievementToastHeld({ name: "playing", cinematic: false, bossIntro: true })).toBe(true);
    const markSeen = vi.fn();
    const pending = [{ id: "giant", name: "Giant Slayer", desc: "", rarity: "uncommon", cat: "combat" }];
    const input = {
      pending,
      rarities: {},
      commonRarity: { name: "COMMON", color: "#fff" },
      categories: {},
      markSeen,
      save: vi.fn(),
      shardsFor: () => 12,
      coinsFor: () => 200,
    };
    const toast = new AchievementToastController((value) => value);
    expect(toast.step(0.2, { ...input, held: held("replay") })).toBeNull();
    expect(pending).toHaveLength(1);
    expect(markSeen).not.toHaveBeenCalled();
    expect(toast.step(0.2, { ...input, held: held("menu") })).toMatchObject({ name: "Giant Slayer" });
  });

  it("finishes touch onboarding after seven seconds", () => {
    const controller = new TouchOnboardingController();
    expect(controller.step(6.5, false)).toEqual({ alpha: 0.5, completed: false });
    expect(controller.step(0.5, false)).toEqual({ alpha: 0, completed: true });
  });
});
