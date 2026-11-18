// Types for music-cover.mjs, so TypeScript tests can use the add tool's rules.
export interface CoverFile {
  readonly file: string;
  readonly size: number;
  readonly bytes: number;
  readonly sha256: string;
}
export interface CoverRow {
  readonly stageId: string;
  readonly files: readonly CoverFile[];
}
export interface CoverManifest<Row extends CoverRow = CoverRow> {
  readonly maxTotalBytes: number;
  readonly covers: readonly Row[];
}

export declare const COVERS_DIR: string;
export declare function coverFileName(stageId: string, size: number): string;
export declare function encodeCover(
  manifest: Readonly<{ sizes: readonly number[]; encoding: Readonly<{ quality: number; effort: number }> }>,
  stageId: string,
  source: Uint8Array,
): Promise<(CoverFile & { readonly data: Uint8Array })[]>;
export declare function withCover<Row extends CoverRow, Manifest extends CoverManifest<Row>>(
  manifest: Manifest,
  row: Row,
): Manifest;
export declare function addCover(
  stageId: string,
  painting: string,
  options: Readonly<{ description?: string; licence?: string }>,
  dir?: string,
): Promise<void>;
