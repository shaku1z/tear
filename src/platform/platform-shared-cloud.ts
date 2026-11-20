import { leaderboardId, leaderboardKind, rankEntries, scoreBeats } from "../domain/leaderboards";
import { isRecord } from "../domain/records";
import type { ScoreEntry, SharedCloudService } from "./cloud";
import type { PlatformServices } from "./contracts";

function scoreEntry(entry: ScoreEntry, rank: number, replayId?: string): Record<string, unknown> {
  return {
    name: entry.name ?? "Player",
    score: entry.score,
    wave: entry.wave ?? 0,
    time: entry.time ?? 0,
    rank,
    ...(replayId === undefined ? {} : { replayId }),
  };
}

/**
 * Bridges a target's typed leaderboard capability to the legacy cloud facade. A board whose
 * direction the provider does not rank is refused; a score that does not beat this session's
 * last submission to the board is not sent; entries come back in the board's rank order.
 */
export function createPlatformSharedCloud(getPlatform: () => PlatformServices): SharedCloudService {
  const submittedScores = new Map<string, number>();
  const leaderboards = () => {
    const capability = getPlatform().leaderboards;
    return capability.available ? capability.service : null;
  };
  return {
    get available() {
      return leaderboards() !== null;
    },
    ranks(direction) {
      return leaderboards()?.ranks.includes(direction) ?? false;
    },
    async submitScore(ref, entry) {
      const service = leaderboards();
      const { direction } = leaderboardKind(ref);
      if (!service?.ranks.includes(direction)) return false;
      const boardId = leaderboardId(ref);
      if (!scoreBeats(direction, entry.score, submittedScores.get(boardId))) return false;
      await service.submit(boardId, entry.score);
      submittedScores.set(boardId, entry.score);
      return true;
    },
    async topScores(ref, limit) {
      const service = leaderboards();
      const { direction } = leaderboardKind(ref);
      if (!service?.ranks.includes(direction)) return null;
      const entries = rankEntries(direction, await service.entries(leaderboardId(ref), limit));
      return entries.map((entry, index) =>
        scoreEntry({ name: entry.displayName, score: entry.score }, index + 1, entry.replayId),
      );
    },
    logEvent(name, data) {
      const capability = getPlatform().analytics;
      if (!capability.available) return;
      const properties = Object.fromEntries(
        Object.entries(data).flatMap(([key, value]) =>
          typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
            ? [[key, value]]
            : [],
        ),
      );
      capability.service.event(name, properties);
    },
    async publishReplay(recording) {
      const service = leaderboards();
      if (!service) return null;
      const id = await service.publishReplay(JSON.stringify(recording));
      return id || null;
    },
    async loadReplay(shareId) {
      const service = leaderboards();
      if (!service) return null;
      const serialized = await service.loadReplay(shareId);
      if (serialized === null) return null;
      const parsed: unknown = JSON.parse(serialized);
      return isRecord(parsed) ? { ...parsed } : null;
    },
    replayFeed() {
      return Promise.resolve(null);
    },
    async linkReplay(ref, shareId) {
      const service = leaderboards();
      const boardId = leaderboardId(ref);
      const score = submittedScores.get(boardId);
      if (!service || score === undefined) return false;
      await service.submit(boardId, score, shareId);
      return true;
    },
    loadGhost() {
      return Promise.resolve(null);
    },
  };
}
