// Types for reports.mjs, so TypeScript tests can run the CLI's contrast check.
export interface ContrastReport {
  readonly paper: string;
  readonly ink: string;
  /** Zone label -> ink label -> share of pixels at 3:1 or better (0..1). */
  readonly zones: Readonly<Record<string, Readonly<Record<string, number>>>>;
}
export declare function contrastReport(
  directory: string,
  options: { platforms?: string; with?: string; out?: string; ink?: string; quiet?: boolean },
): Promise<ContrastReport>;
