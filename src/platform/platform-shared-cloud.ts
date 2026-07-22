import type { ScoreEntry, SharedCloudService } from "./cloud";
import type { PlatformServices } from "./contracts";

function board(mode: string, difficulty: string): string {
  return `${mode}_${difficulty}`;
}

function isDataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

/** Bridges a target's typed leaderboard capability to the legacy cloud facade. */
export function createPlatformSharedCloud(getPlatform: () => PlatformServices): SharedCloudService {
  const submittedScores = new Map<string, number>();
  const leaderboards = () => {
    const capability = getPlatform().leaderboards;
    return capability.available ? capability.service : null;
  };
  return {
    get available() { return leaderboards() !== null; },
    async submitScore(mode, difficulty, entry) {
      const service = leaderboards();
      if (!service) return false;
      const boardId = board(mode, difficulty);
      await service.submit(boardId, entry.score);
      submittedScores.set(boardId, entry.score);
      return true;
    },
    async topScores(mode, difficulty, limit) {
      const service = leaderboards();
      if (!service) return null;
      const entries = await service.entries(board(mode, difficulty), limit);
      return entries.map((entry, index) => scoreEntry(
        { name: entry.displayName, score: entry.score }, entry.rank ?? index + 1, entry.replayId,
      ));
    },
    logEvent(name, data) {
      const capability = getPlatform().analytics;
      if (!capability.available) return;
      const properties = Object.fromEntries(Object.entries(data).flatMap(([key, value]) =>
        typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
          ? [[key, value]]
          : []));
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
      return isDataRecord(parsed) ? { ...parsed } : null;
    },
    replayFeed() { return Promise.resolve(null); },
    async linkReplay(mode, difficulty, shareId) {
      const service = leaderboards();
      const boardId = board(mode, difficulty);
      const score = submittedScores.get(boardId);
      if (!service || score === undefined) return false;
      await service.submit(boardId, score, shareId);
      return true;
    },
    loadGhost() { return Promise.resolve(null); },
  };
}
