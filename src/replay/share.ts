/**
 * Sharing a record: what a published replay holds, what the feed row shows of it, and the cloud port a
 * sharing target implements. Publishing from the results screen (each board a run beats) and SHARE on the
 * REPLAYS list both publish through `shareReplay`; a leaderboard row and the feed both open what
 * `loadSharedReplay` reads.
 *
 * - **The upload** is the record as the store holds it (`encoding.ts`: the gzip bytes of its JSON), as
 *   base64 text, so a long run fits the upload cap: about 80 KB a minute instead of about 700 KB as JSON.
 *   Where the browser cannot compress, the upload is the record itself. The DOWNLOAD and IMPORT file stays
 *   plain JSON (encoding.ts).
 * - **The summary** is the feed row: the fields the cloud stores beside the upload, read from the record.
 * - **Reading** goes through `readReplayRecord`, so a replay published before this record existed (a
 *   Ghost 2 recording) is refused as one from an earlier version, never played through another path.
 */
import { isRecord } from "../domain/records";
import { decodeReplayRecord, encodeReplayRecord } from "./encoding";
import {
  MALFORMED_MESSAGE,
  readReplayRecord,
  REPLAY_FORMAT,
  REPLAY_VERSION,
  type ReplayReadResult,
  type ReplayRecord,
} from "./record";

/** The feed row of a published replay, as the cloud stores it beside the upload (firestore.rules isReplaySummary). */
export type SharedReplaySummary = Readonly<{
  mode: string;
  diff: string;
  wave: number;
  score: number;
  time: number;
  won: boolean;
  kills: number;
  /**
   * The cloud's summary has this field and its rules require it; a record does not carry the run's peak, so
   * it is 0. Nothing draws it.
   */
  peak: 0;
  name: string;
  thumb: null;
}>;

/** What a sharing target implements: publish an upload with its summary, and load one back by its id. */
export interface ReplayShareCloud {
  readonly publishReplay: (
    upload: Readonly<Record<string, unknown>>,
    summary: SharedReplaySummary,
    fixedIdPrefix?: string,
  ) => Promise<string | null>;
  readonly loadReplay: (shareId: string) => Promise<unknown>;
}

/** The cloud summary's name limit (firestore.rules). */
const NAME_LIMIT = 32;

/** The feed row of a record. */
export function sharedReplaySummary(record: ReplayRecord): SharedReplaySummary {
  return Object.freeze({
    mode: record.run.start.mode,
    diff: record.run.start.difficulty,
    wave: record.summary.wave,
    score: Math.trunc(record.summary.score),
    time: record.summary.time,
    won: record.run.result.outcome === "victory",
    kills: record.summary.kills,
    peak: 0,
    name: record.look.playerName.slice(0, NAME_LIMIT) || "Player",
    thumb: null,
  });
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
}

function bytesOf(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/** The upload of a record: its stored gzip encoding as base64, or the record itself where nothing compresses. */
export async function sharedReplayUpload(record: ReplayRecord): Promise<Readonly<Record<string, unknown>>> {
  const encoded = await encodeReplayRecord(JSON.stringify(record));
  if (typeof encoded === "string") return record as unknown as Readonly<Record<string, unknown>>;
  return Object.freeze({ format: REPLAY_FORMAT, version: REPLAY_VERSION, gzip: base64(encoded) });
}

/** Reads an upload (or a bare record) as untrusted data. Never throws. */
export async function readSharedReplay(value: unknown): Promise<ReplayReadResult> {
  if (!isRecord(value) || typeof value.gzip !== "string") return readReplayRecord(value);
  const bytes = bytesOf(value.gzip);
  const json = bytes === null ? null : await decodeReplayRecord(bytes);
  if (json === null) return readReplayRecord(null);
  try {
    return readReplayRecord(JSON.parse(json));
  } catch {
    return Object.freeze({ ok: false, reason: "malformed", message: MALFORMED_MESSAGE, detail: "upload is not JSON" });
  }
}

/** Publishes a record; `fixedIdPrefix` names a leaderboard's own replay. The share id, or null when it failed. */
export async function shareReplay(
  cloud: Pick<ReplayShareCloud, "publishReplay">,
  record: ReplayRecord,
  fixedIdPrefix?: string,
): Promise<string | null> {
  try {
    const shareId = await cloud.publishReplay(
      await sharedReplayUpload(record),
      sharedReplaySummary(record),
      fixedIdPrefix,
    );
    return shareId === null || shareId === "" ? null : shareId;
  } catch {
    return null;
  }
}

/** A published replay, read; null when it could not be loaded at all. */
export async function loadSharedReplay(
  cloud: Pick<ReplayShareCloud, "loadReplay">,
  shareId: string,
): Promise<ReplayReadResult | null> {
  try {
    const upload = await cloud.loadReplay(shareId);
    return upload === null || upload === undefined ? null : await readSharedReplay(upload);
  } catch {
    return null;
  }
}
