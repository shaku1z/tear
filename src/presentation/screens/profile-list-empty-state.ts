import type { ProfileScreenView } from "./contracts";

/** What the Vault says while its saved replays are still being read. */
export const VAULT_OPENING_MESSAGE = "Opening your saved replays…";

/**
 * The Vault list's state as the profile screen needs it. Until the saved replays have been read
 * the list is not known to be empty, so "opening" and "failed" must not be drawn as "none yet".
 */
export function vaultListState(
  status: "idle" | "loading" | "ready" | "unavailable" | "failed",
): NonNullable<ProfileScreenView["vaultList"]> | undefined {
  if (status === "idle" || status === "loading") return "opening";
  return status === "ready" ? undefined : "failed";
}

export interface ProfileListEmptyState {
  readonly glyph: string;
  readonly line: string;
  readonly detail: string;
}

/** The one description of an empty Replays or Vault list, shared by the desktop and phone screens. */
export function profileListEmptyState(
  view: Pick<ProfileScreenView, "tab" | "message" | "emptyMessage" | "vaultList">,
): ProfileListEmptyState {
  if (view.tab !== "vault")
    return {
      glyph: "▶",
      line: "No runs recorded yet",
      detail: view.emptyMessage ?? "Every real run lands here automatically.",
    };
  if (view.vaultList === "opening") return { glyph: "◆", line: VAULT_OPENING_MESSAGE, detail: "" };
  if (view.vaultList === "failed")
    return { glyph: "◆", line: "Saved replays could not be opened", detail: view.message ?? "" };
  return {
    glyph: "◆",
    line: "No saved replays yet",
    detail: view.message ?? "Every run you finish is saved here automatically, ready to watch from the start.",
  };
}
