export interface CampaignCinematicDirector {
  readonly progress: number;
  readonly elapsed: number;
  skipTo(id: string): boolean;
}

export interface CampaignCinematicBeat {
  readonly id: string;
  readonly duration?: number;
  readonly skipScale?: number;
  readonly reveal?: Readonly<{ mode?: "none" | "phrase" | "characters"; duration?: number; charsPerSecond?: number }>;
  readonly line?: string;
  readonly completion?: "condition" | "confirm" | "confirm-or-timeout" | "timed";
  readonly waitUntil?: (context: Record<string, unknown>, director: CampaignCinematicDirector) => boolean;
  readonly onEnter?: (context: Record<string, unknown>, director: CampaignCinematicDirector) => void;
  readonly onExit?: (context: Record<string, unknown>, director: CampaignCinematicDirector) => void;
  readonly onUpdate?: (context: Record<string, unknown>, director: CampaignCinematicDirector, deltaSeconds: number) => void;
}

export interface CampaignCinematicScript {
  readonly id: string;
  readonly beats: readonly CampaignCinematicBeat[];
  readonly onStart?: (context: Record<string, unknown>, director: CampaignCinematicDirector) => void;
  readonly onSkip?: (context: Record<string, unknown>, director: CampaignCinematicDirector) => void;
  readonly onComplete?: (context: Record<string, unknown>, director: CampaignCinematicDirector) => void;
  readonly onCancel?: (context: Record<string, unknown>, reason: string, director: CampaignCinematicDirector) => void;
}
