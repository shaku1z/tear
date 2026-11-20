export interface ChunkModuleInfo {
  readonly isEntry: boolean;
  readonly importers: readonly string[];
  readonly dynamicImporters: readonly string[];
  /** The module's code; null where the bundler has not made it available. */
  readonly code: string | null;
}

export interface ChunkMeta {
  readonly getModuleInfo: (id: string) => ChunkModuleInfo | null;
}

export const ON_DEMAND_SHARED_CHUNK: string;
export const SMALL_SHARED_MODULE_CHARS: number;
export function reachedOnlyDynamically(id: string, meta: ChunkMeta, memo?: Map<string, boolean>): boolean;
export function applicationChunk(id: string, meta: ChunkMeta): string | undefined;
