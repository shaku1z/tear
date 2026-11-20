import { isRecord, requireRecord } from "../../domain/records";

/** Sticky category, installed before native content/start; no progression or automatic publication. */
export interface BeatRunBinding {
  readonly format: "tear-beat-attempt";
  readonly version: 1;
  readonly codeHash: string;
  readonly source: Readonly<{ capsule: string; root: string; manifest: string }>;
}
export function readBeatRunBinding(value: unknown): BeatRunBinding | undefined {
  if (value === undefined) return undefined;
  const v = requireRecord(value, "Invalid Beat This Run binding"),
    s = v.source;
  if (
    Object.keys(v).sort().join() !== "codeHash,format,source,version" ||
    v.format !== "tear-beat-attempt" ||
    v.version !== 1 ||
    typeof v.codeHash !== "string" ||
    !/^[a-f0-9]{16}$/u.test(v.codeHash) ||
    !isRecord(s) ||
    Object.keys(s).sort().join() !== "capsule,manifest,root" ||
    typeof s.capsule !== "string" ||
    !s.capsule ||
    s.capsule.length > 256 ||
    [s.root, s.manifest].some((h) => typeof h !== "string" || !/^[a-f0-9]{16}$/u.test(h))
  )
    throw new TypeError("Invalid Beat This Run binding");
  return Object.freeze({ ...v, source: Object.freeze({ ...s }) }) as unknown as BeatRunBinding;
}
