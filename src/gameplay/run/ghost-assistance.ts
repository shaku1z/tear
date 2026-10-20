/** Sticky run data: hiding a reference cannot restore competitive eligibility. */
export interface GhostRunAssistance {
  readonly format: "tear-ghost-chase";
  readonly version: 1;
  readonly sourceId: string;
  readonly sourceManifestHash: string;
  readonly sourceRoot: string;
  readonly actor: "human" | "bot" | "unknown";
  readonly coachEnabled: true;
  readonly ghostVisible: true;
  readonly competitiveEligible: false;
}

export function readGhostRunAssistance(value: unknown): GhostRunAssistance | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Invalid Chase disposition");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== ["format", "version", "sourceId", "sourceManifestHash", "sourceRoot", "actor", "coachEnabled", "ghostVisible", "competitiveEligible"].sort().join()
    || v.format !== "tear-ghost-chase" || v.version !== 1 || typeof v.sourceId !== "string" || !v.sourceId || v.sourceId.length > 256
    || [v.sourceManifestHash, v.sourceRoot].some((h) => typeof h !== "string" || !/^[a-f0-9]{16}$/u.test(h))
    || !["human", "bot", "unknown"].includes(String(v.actor)) || v.coachEnabled !== true || v.ghostVisible !== true || v.competitiveEligible !== false) throw new TypeError("Invalid Chase disposition");
  return Object.freeze({ ...v }) as unknown as GhostRunAssistance;
}
