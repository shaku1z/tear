import { describe, expect, it, vi } from "vitest";

import { createLivePendingFinalePersistence } from "../../src/app/live-pending-finale-persistence";

describe("live pending-finale persistence adapter", () => {
  it("preserves the profile operation contract", () => {
    const pending = { weapon: "sword", wave: 50, score: 12_345 };
    const setPendingFinale = vi.fn();
    const save = vi.fn();
    const clearPendingFinale = vi.fn();
    const persistence = createLivePendingFinalePersistence({ setPendingFinale, save, clearPendingFinale,
      pendingFinale: () => pending });

    persistence.persist(pending);
    persistence.saveProfile();
    persistence.clear();

    expect(setPendingFinale).toHaveBeenCalledWith(pending);
    expect(save).toHaveBeenCalledOnce();
    expect(clearPendingFinale).toHaveBeenCalledOnce();
    expect(persistence.pending()).toEqual(pending);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
