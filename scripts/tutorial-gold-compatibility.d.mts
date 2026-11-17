export const FINGERPRINT_SCHEME: string;
export const TUTORIAL_GOLD_ROOTS: readonly string[];
export const SHIPPING_CORPUS: string;
export const SHIPPING_BINDING: string;
export const BINDING_FORMAT: string;
export interface NormalizedTutorialGoldModule {
  readonly stream: string;
  readonly targets: readonly string[];
}
export function normalizeModuleSource(
  fileName: string,
  text: string,
  resolveImport?: (specifier: string) => string | undefined,
): NormalizedTutorialGoldModule;
export function collectTutorialGoldModules(
  root?: string,
  roots?: readonly string[],
): Map<string, NormalizedTutorialGoldModule>;
export function combineModuleFingerprint(modules: ReadonlyMap<string, NormalizedTutorialGoldModule>): string;
export function tutorialGoldSourceFingerprint(
  root?: string,
  roots?: readonly string[],
): Readonly<{ sourceHash: string; files: readonly string[] }>;
export const GOLD_TEST: string;
export const GOLD_TEST_NAME: string;
export const VERIFIED_RECORD: string;
export function tutorialGoldBinding(corpus: { readonly contentHash: string }): {
  format: string;
  corpusContentHash: string;
};
export function committedTutorialGold(root?: string): string;
export function isTutorialGoldVerified(root: string, sourceHash: string, corpusContentHash: string): boolean;
export function recordTutorialGoldVerified(root: string, sourceHash: string, corpusContentHash: string): void;
export function assertTutorialGoldFresh(
  root?: string,
  options?: { runTest?: (root: string) => { ok: boolean; output: string } },
): string;
