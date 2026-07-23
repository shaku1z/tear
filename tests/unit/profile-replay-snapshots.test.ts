import { describe, expect, it } from "vitest";
import { buildProfileReplays } from "../../src/presentation/profile-snapshots";

describe("profile replay snapshots", () => {
  it("preserves oracle replay-card thumbnails, publication status, and identity", () => {
    const rows = buildProfileReplays([{ id: "local-1", ts: 0, pin: true, shareId: "shared-1",
      sum: { name: "Blade", mode: "endless", diff: "normal", wave: 8, score: 900, thumb: "data:image/jpeg;base64,abc" } }],
    [{ id: "endless", label: "Endless" }]);
    expect(rows[0]).toMatchObject({ id: "local-1", title: "Blade — Endless · normal", detail: "wave 8 · 900 pts",
      thumbnailId: "data:image/jpeg;base64,abc", pinned: true, shared: true });
    expect(rows[0]?.timestamp).toContain("PUBLISHED");
  });
});
