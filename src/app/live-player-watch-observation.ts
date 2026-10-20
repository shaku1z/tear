import type { GhostVaultBackend, GhostVaultGuard } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { TearC32CanonicalActiveDecisionV1 } from "../agents/c32-canonical-active-policy-runtime";
import { TearPolicyDecisionJournal, parseTearPolicyDecisionJournal } from "../agents/policy-decision-journal";
import { parseTearPolicyActivation, parseTearPolicyArtifact, type TearPolicyActivationV1 } from "../agents/policy-artifact-registry";
import { parseTearFoundryV3PromotionReceipt } from "../agents/foundry-job-v3-promotion";
import { parseTearFoundryV3PromotionApprovalOrigin } from "../agents/foundry-job-v3-promotion-approval";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol } from "../agents/foundry-job-state";
import { createTearFoundryV3PostPromotionTerminalReceipt, parseTearFoundryV3PostPromotionMonitorRecord,
  TearFoundryV3PostPromotionMonitor } from "../agents/foundry-job-v3-post-promotion-monitor";
import { commitTrainingOperationsJobWrites } from "../agents/training-operations-budget";
import { stableVerificationHash } from "../replay/hash";

export const PLAYER_WATCH_DECISION_LIMIT = 256;
export interface PlayerWatchTerminal { readonly status: "completed" | "failed" | "stopped"; readonly tick: number; readonly reason?: string }
export interface PlayerWatchObservation {
  begin(): Promise<void>;
  record(state: CanonicalGameplayState, decision: TearC32CanonicalActiveDecisionV1): void;
  finish(terminal: PlayerWatchTerminal): Promise<string>;
}

/** Historical projection only: a retained stop/failure never becomes a passing health claim. */
export async function previousPlayerWatchObservation(backend: GhostVaultBackend, activation: TearPolicyActivationV1): Promise<string | undefined> {
  const keys = (await backend.keys("analysis")).filter((key) => key.startsWith("foundry-job-v3-post-promotion-monitor:v1:"));
  if (keys.length > 256) return undefined;
  const journalKeys = (await backend.keys("analysis")).filter((id) => id.startsWith("policy-decision-journal:v1:watch-policy:v1:"));
  if (journalKeys.length > 256) return undefined;
  const journals = new Map<string, ReturnType<typeof parseTearPolicyDecisionJournal>>();
  for (const key of journalKeys) {
    try {
      const raw = await backend.get("analysis", key);
      if (raw === undefined) continue;
      const journal = parseTearPolicyDecisionJournal(JSON.parse(raw));
      if (key === `policy-decision-journal:v1:${journal.id}` && journal.droppedEntries === 0) journals.set(journal.journalHash, journal);
    } catch { /* Invalid historical bytes supply no success projection. */ }
  }
  const matches = [];
  for (const key of keys) {
    try {
      const raw = await backend.get("analysis", key);
      if (raw === undefined) continue;
      const retained = parseTearFoundryV3PostPromotionMonitorRecord(JSON.parse(raw));
      if (key !== `foundry-job-v3-post-promotion-monitor:v1:${retained.recordHash}` || retained.promotion.activationHash !== activation.activationHash) continue;
      const receiptRaw = await backend.get("analysis", `foundry-job-v3-promotion-receipt:v1:${retained.promotion.approvalHash}`);
      const approvalRaw = await backend.get("analysis", `foundry-job-v3-promotion-approval:v1:${retained.promotion.approvalHash}`);
      if (receiptRaw === undefined || approvalRaw === undefined) continue;
      const promotion = parseTearFoundryV3PromotionReceipt(JSON.parse(receiptRaw)), approval = parseTearFoundryV3PromotionApprovalOrigin(JSON.parse(approvalRaw));
      const journal = journals.get(retained.evidence.journalHash);
      const indexRaw = await backend.get("indexes", `foundry-job-v3-post-promotion-monitor:${activation.artifactHash}:${retained.recordHash}`);
      if (indexRaw !== JSON.stringify({ classification: retained.classification, active: true, aggregateOnly: true })) continue;
      if (promotion.receiptHash !== retained.promotion.promotionReceiptHash || approval.approvalHash !== promotion.approvalHash
        || approval.candidate.artifactHash !== activation.artifactHash || promotion.activationHash !== activation.activationHash) continue;
      if (journal?.entries.length === retained.evidence.decisionCount && journal.rootHash === retained.evidence.journalRootHash
        && journal.entries.every((entry) => entry.receipt.source === "artifact" && entry.receipt.activationHash === activation.activationHash
          && entry.receipt.artifactId === activation.artifactId && entry.receipt.artifactHash === activation.artifactHash)) matches.push(retained);
    } catch { /* Invalid historical bytes supply no success projection. */ }
  }
  const latest = matches.sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt))[0];
  return latest === undefined ? undefined : `Previous observation retained: ${latest.evidence.terminalStatus}. No automatic rollback.`;
}

/** One normal session, exact promotion provenance, bounded journal, then the existing C36 observer. */
export async function createPlayerWatchObservation(backend: GhostVaultBackend, activation: TearPolicyActivationV1): Promise<PlayerWatchObservation | undefined> {
  const guards: GhostVaultGuard[] = [];
  const required = async (store: GhostVaultGuard["store"], key: string) => {
    const raw = await backend.get(store, key);
    if (raw === undefined) throw new RangeError("Run Monitor provenance is unavailable");
    guards.push({ store, key, expected: raw }); return raw;
  };
  const activeRaw = await required("analysis", "policy-active:v1");
  if (JSON.stringify(parseTearPolicyActivation(JSON.parse(activeRaw))) !== JSON.stringify(activation)) throw new RangeError("Run Monitor active policy changed");
  const artifact = parseTearPolicyArtifact(JSON.parse(await required("analysis", `policy-artifact:v1:${activation.artifactId}`)));
  if (artifact.artifactHash !== activation.artifactHash
    || await required("indexes", `policy-artifact:${artifact.id}`) !== JSON.stringify({ artifactHash: artifact.artifactHash, createdAt: artifact.createdAt })
    || await required("indexes", `policy-activation:v1:${String(activation.revision).padStart(12, "0")}`) !== JSON.stringify(activation)) throw new RangeError("Run Monitor artifact or activation pair changed");
  const keys = (await backend.keys("analysis")).filter((key) => key.startsWith("foundry-job-v3-promotion-receipt:v1:"));
  if (keys.length > 256) throw new RangeError("Run Monitor refuses unbounded promotion lookup");
  const matches = [];
  for (const key of keys) {
    const raw = await backend.get("analysis", key);
    if (raw === undefined) continue;
    const receipt = parseTearFoundryV3PromotionReceipt(JSON.parse(raw));
    if (receipt.activationHash === activation.activationHash && receipt.artifactId === activation.artifactId && receipt.artifactHash === activation.artifactHash) {
      if (key !== `foundry-job-v3-promotion-receipt:v1:${receipt.approvalHash}` || receipt.revision !== activation.revision) throw new RangeError("Run Monitor promotion identity changed");
      matches.push({ receipt, key, raw });
    }
  }
  if (matches.length === 0) return undefined; // Existing unpromoted local Watch remains usable without claiming C36 evidence.
  const matched = matches[0];
  if (matches.length !== 1 || matched === undefined) throw new RangeError("Run Monitor promotion is ambiguous");
  guards.push({ store: "analysis", key: matched.key, expected: matched.raw });
  const promotion = matched.receipt;
  const approval = parseTearFoundryV3PromotionApprovalOrigin(JSON.parse(await required("analysis", `foundry-job-v3-promotion-approval:v1:${promotion.approvalHash}`)));
  if (approval.approvalHash !== promotion.approvalHash || approval.candidate.id !== activation.artifactId
    || approval.candidate.artifactHash !== activation.artifactHash) throw new RangeError("Run Monitor approval changed");
  const job = parseTearFoundryJob(JSON.parse(await required("analysis", `foundry-job:v1:${approval.job.id}`)));
  const event = job.events.at(-1);
  if (job.phase !== "monitoring" || job.jobHash !== approval.job.jobHash || requireTearFoundryEvaluationProtocol(job).protocolHash !== approval.job.protocolHash
    || job.inputs.stopConditionsHash !== approval.job.stopConditionsHash || event === undefined) throw new RangeError("Run Monitor monitoring head changed");
  if (await required("analysis", `foundry-job-event:v1:${job.id}:${String(event.sequence)}:${event.eventHash}`) !== JSON.stringify(event)
    || await required("indexes", `foundry-job-current:${job.id}`) !== JSON.stringify({ jobHash: job.jobHash, phase: job.phase })) throw new RangeError("Run Monitor durable head changed");
  const native = approval.format === "training-operations-v3-native-promotion-approval";
  const journalId = `watch-policy:v1:normal:${globalThis.crypto.randomUUID()}`, journalKey = `policy-decision-journal:v1:${journalId}`;
  const journalBackend: GhostVaultBackend = native ? {
    get: (store, key) => backend.get(store, key), put: (store, key, value) => backend.put(store, key, value),
    remove: (store, key) => backend.remove(store, key), keys: (store) => backend.keys(store),
    commitIfMatches: (expected, writes) => backend.commitIfMatches(expected, writes),
    commitWhileJournalMatches: (session, lease, writes, expected) => backend.commitWhileJournalMatches(session, lease, writes, expected),
    commit: async (writes) => {
    if (writes.some((write) => write.store !== "analysis" || write.key !== journalKey)) throw new RangeError("Run Monitor journal cannot write foreign records");
    await commitTrainingOperationsJobWrites(backend, job, guards, writes);
  } } : backend;
  const journal = new TearPolicyDecisionJournal(journalBackend), monitor = new TearFoundryV3PostPromotionMonitor(backend);
  let begun = false, invalid = false, count = 0, finished: Promise<string> | undefined;
  return Object.freeze({
    async begin() {
      if (begun || finished !== undefined) throw new RangeError("Run Monitor observation already started");
      begun = true;
      if (native) await commitTrainingOperationsJobWrites(backend, job, [...guards, { store: "analysis", key: journalKey }], []);
      else await backend.commitIfMatches([...guards, { store: "analysis", key: journalKey }], []);
      journal.begin(journalId, PLAYER_WATCH_DECISION_LIMIT);
    },
    record(state: CanonicalGameplayState, decision: TearC32CanonicalActiveDecisionV1) {
      if (!begun || finished !== undefined || count >= PLAYER_WATCH_DECISION_LIMIT) throw new RangeError("Run Monitor observation is closed or full");
      if (decision.artifactId !== activation.artifactId || decision.artifactHash !== activation.artifactHash || decision.activationHash !== activation.activationHash) { invalid = true; throw new RangeError("Run Monitor decision provenance changed"); }
      journal.append({ tick: state.tick, receipt: { observationHash: decision.stateHash, source: decision.source,
        artifactId: decision.artifactId, artifactHash: decision.artifactHash, activationHash: decision.activationHash,
        ...(decision.reason === undefined ? {} : { reason: decision.reason }),
        ...(decision.support === undefined ? {} : { support: decision.support }),
        ...(decision.decisionMilliseconds === undefined ? {} : { decisionMilliseconds: decision.decisionMilliseconds }) }, actions: decision.actions,
        // Journal schema requires descriptive labels; these do not represent a learned confidence estimate.
        trace: { tick: state.tick, profile: "survival", objective: "survive", maneuver: "track", confidence: 0, recovery: false,
          observationClass: "structured-state", critic: ["Canonical artifact decisions; descriptive trace only, confidence unmeasured."] } });
      count++;
    },
    finish(terminal: PlayerWatchTerminal) {
      finished ??= (async () => {
        try {
          if (!begun) throw new RangeError("Run Monitor observation did not start");
          await journal.flush();
          const persisted = await journal.read(journalId);
          if (invalid || persisted?.entries.length !== count || persisted.droppedEntries !== 0 || journal.snapshot().pending !== 0) throw new RangeError("Run Monitor journal is incomplete");
          if (native) await commitTrainingOperationsJobWrites(backend, job, guards, []);
          else await backend.commitIfMatches(guards, []);
          const receipt = createTearFoundryV3PostPromotionTerminalReceipt({ journalId, journalHash: persisted.journalHash,
            terminal: { status: terminal.status, tick: terminal.tick, ...(terminal.reason === undefined ? {} : { reasonHash: stableVerificationHash(terminal.reason) }) } });
          const retained = await monitor.retain(receipt, new Date().toISOString());
          return `Observation retained: ${retained.evidence.terminalStatus}. No automatic rollback.`;
        } catch { return "Observation not retained: incomplete journal, changed policy or unavailable storage. Native play is restored."; }
      })();
      return finished;
    },
  });
}
