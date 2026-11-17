/** What a replay records about the tear-score music engine; written by audio, read and validated by replay. */
export type TearScoreReplayMetadata =
  | Readonly<{
      enabled: true;
      engineVersion: string;
      scoreVersion: string;
      seed: string;
      eventJournalHash: string;
    }>
  | Readonly<{
      enabled: false;
      reason: "disabled" | "fallback" | "not-recorded";
    }>;
