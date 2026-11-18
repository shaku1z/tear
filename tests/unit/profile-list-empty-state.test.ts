import { describe, expect, it } from "vitest";
import {
  VAULT_OPENING_MESSAGE,
  profileListEmptyState,
  vaultListState,
} from "../../src/presentation/screens/profile-list-empty-state";

describe("the profile screen's empty Replays and Vault lists", () => {
  it("treats a Vault that has not been read yet as opening, and one that cannot be read as failed", () => {
    expect(vaultListState("idle")).toBe("opening");
    expect(vaultListState("loading")).toBe("opening");
    expect(vaultListState("ready")).toBeUndefined();
    expect(vaultListState("failed")).toBe("failed");
    expect(vaultListState("unavailable")).toBe("failed");
  });

  it("names the Vault's state instead of calling an unread list empty", () => {
    expect(profileListEmptyState({ tab: "vault", vaultList: "opening", message: VAULT_OPENING_MESSAGE })).toEqual({
      glyph: "◆",
      line: VAULT_OPENING_MESSAGE,
      detail: "",
    });
    expect(profileListEmptyState({ tab: "vault", vaultList: "failed", message: "why" })).toMatchObject({
      line: "Saved replays could not be opened",
      detail: "why",
    });
    expect(profileListEmptyState({ tab: "vault", message: "" }).line).toBe("No saved replays yet");
    expect(profileListEmptyState({ tab: "vault", message: "" }).detail).toMatch(/saved here automatically/u);
  });

  it("keeps the Replays tab's wording", () => {
    expect(profileListEmptyState({ tab: "replays", emptyMessage: "go" })).toEqual({
      glyph: "▶",
      line: "No runs recorded yet",
      detail: "go",
    });
  });
});
