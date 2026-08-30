export interface CampaignPublicationPolicy {
  readonly format: "tear-campaign-publication-boundary";
  readonly schemaVersion: 1;
  readonly status: "engineering-only" | "public";
  readonly rulesetVersion: string;
  readonly activeStageIds: readonly string[];
  readonly previewStageIds: readonly string[];
}

export function validateCampaignPublicationPolicy(value: unknown): CampaignPublicationPolicy;
export function assertCampaignPublicationAllowed(value: unknown): CampaignPublicationPolicy;
export function readCampaignPublicationPolicy(root: string): Promise<CampaignPublicationPolicy>;
