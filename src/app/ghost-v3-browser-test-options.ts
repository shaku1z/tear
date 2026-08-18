import type { BrowserGhostLiveRecorderOptions } from "../ghost/live-recorder";
import type { GhostRecordingProfileId } from "../ghost/recording-profiles";

/** Test-build-only fault hook used by browser evidence; production has no URL-controlled recorder behavior. */
export function createGhostV3BrowserTestOptions(testMode: boolean, search: string): BrowserGhostLiveRecorderOptions | undefined {
  if (!__TEAR_TEST_BUILD__ || !testMode) return undefined;
  const query = new URLSearchParams(search);
  const profile = query.get("ghost-v3-profile");
  const recordingProfile: GhostRecordingProfileId | undefined = profile === "forensic-qa" ? profile : undefined;
  if (query.get("ghost-v3-storage-fault") !== "quota-on-first-chunk") {
    return recordingProfile === undefined ? undefined : Object.freeze({ recordingProfile });
  }
  let faulted = false;
  return Object.freeze({
    ...(recordingProfile === undefined ? {} : { recordingProfile }),
    chunkEntries: 1,
    maxPendingWrites: 1,
    beforeCommit(operations: Parameters<NonNullable<BrowserGhostLiveRecorderOptions["beforeCommit"]>>[0]) {
      if (faulted || !operations.some((operation) => operation.store === "chunks")) return;
      faulted = true;
      throw new DOMException("Ghost V3 test storage quota exceeded", "QuotaExceededError");
    },
  });
}
