/** Closed Training Archive payload shapes for this governed V3 boundary only. General registry
 * extensions and resumable training checkpoints retain their own contracts. */
type Shape = "scalar" | "numbers" | { [key: string]: Shape } | [Shape];
const fields = (names: string): Record<string, Shape> => Object.fromEntries(names.split(" ").map((name) => [name, "scalar"]));
const list: Shape = ["scalar"];
const signature = fields("kind keyId");
const build = fields("version revision target rulesetVersion contentHash configHash");
const action = fields("type x y turn magnitude intent phase abilityId choiceId");
const actions: Shape = [action]; // Canonical action validation still owns discriminated shapes.
const offlineConfig = fields("epochs learningRate gamma maxStateActionEntries maxAbsoluteQ maxMeanAbsoluteTdError maxConsecutiveDivergentEpochs");
const onlineConfig = fields("learningRate gamma maxTicks maxUpdates maxAbsoluteQ");
const component = fields("id source weight maximumSourceValue perTransitionCap");
const limits = fields("maxTransitions maxEventsPerTransition maxRewardViolations");
const rewardDefinition = { ...fields("totalMinimum totalMaximum schemaVersion"), components: [component] as Shape };
const scenario: Shape = { ...fields("format kind schemaVersion id version description stateClass executionClass seed maxTicks"),
  subject: fields("kind id"), backends: list, start: fields("mode difficulty weapon stage wave boss bossPhase"), assertions: list, tags: list };
const request: Shape = { ...fields("manifestHash manifestRootHash actor at minimumRewardGain parentArtifactId"),
  dataset: fields("manifestId trainerId version"), artifact: { ...fields("id createdAt levelTarget"), signature },
  reward: { ...fields("id version seed"), reward: rewardDefinition, limits },
  offline: { ...fields("id version variant"), actionVocabulary: actions, config: offlineConfig },
  online: { ...fields("id"), scenarios: [scenario], config: onlineConfig } };
const qValue = fields("stateHash semanticActionHash actionHash value");
const adapter = fields("id adapterHash");
const model: Shape = { ...fields("format schemaVersion modelHash"), sourceStateAdapter: adapter, entries: [qValue] };
const artifact: Shape = { ...fields("format schemaVersion id createdAt actionSchema rewardVersion levelTarget artifactHash"),
  model: fields("format payload modelHash"), encoder: fields("id schemaVersion observationClass normalizationHash"),
  recurrentState: fields("kind schemaVersion"), trainingManifest: fields("id version rootHash"), build, metrics: "numbers",
  lineage: fields("trainingRunId parentArtifactId"), signature,
  compatibility: { ...fields("runtime observationClass actionSchema"), modelFormats: list },
  extensions: fields("c34V3C32ProtocolHash candidateOnly") };
const job: Shape = { ...fields("format schemaVersion id phase jobHash"),
  inputs: { ...fields("evaluationPlanHash rewardDefinitionHash invariantSetHash budgetHash stopConditionsHash"),
    champion: fields("id artifactHash"), corpusRecordHashes: list,
    evaluationProtocol: { ...fields("version id protocolHash"), thresholds: fields("minimumRewardGain requireCompletionRateNotLower maxTicksPerCase maxAbsoluteRewardPerCase") } },
  events: [fields("sequence from to at reason previousEventHash eventHash")] };
const evidence: Shape = { request, ...fields("lineageHash"),
  lineage: { ...fields("requestHash manifestHash manifestRootHash datasetHash sourceBuildsHash rewardPlanHash trajectoryReceiptHash offlinePlanHash trainingHash onlinePlanHash checkpointHash evaluationHash candidateReceiptHash"), custodyRecordHashes: list },
  sourceBuilds: [{ ...fields("scenarioHash"), build }],
  reward: { ...fields("format schemaVersion id version seed planHash"), dataset: fields("datasetHash manifestId manifestVersion manifestRootHash"),
    environment: { ...fields("execution"), scenarioHashes: list }, curriculum: { lessonIds: list, scenarioHashes: list },
    trainingSelection: [fields("candidateHash sequenceHash scenarioHash")], reward: { ...rewardDefinition, ...fields("format schemaVersion rewardHash") }, limits },
  offline: { ...fields("format schemaVersion id version actionVocabularyHash planHash"), receipt: fields("receiptHash planHash rewardHash"),
    sourceStateAdapter: adapter, actionVocabulary: actions, config: offlineConfig },
  training: { ...fields("format schemaVersion disposition trainingHash"), plan: fields("planHash receiptHash adapterHash actionVocabularyHash"),
    checkpoint: fields("checkpointHash epoch updates"), metrics: fields("lastMeanAbsoluteTdError maximumAbsoluteQ stateActionEntries"), model },
  online: { ...fields("format schemaVersion id planHash"), offline: fields("v3PlanHash trainingHash rewardPlanHash receiptHash adapterHash actionVocabularyHash"), scenarios: [scenario], config: onlineConfig },
  // Admission requires complete training; raw resumable world checkpoints have no place here.
  checkpoint: { ...fields("format schemaVersion planHash cursor ticks updates status checkpointHash"), qValues: [qValue] },
  evaluation: { ...fields("format schemaVersion planHash baselineTrainingHash challengerCheckpointHash promotional resultHash"),
    traces: [{ ...fields("side scenarioHash reward terminalHash"), returnEvidence: { ...fields("entryDecisions defaultDecisions scriptedFallbackDecisions terminated truncated"),
      nativeReturns: { ...fields("thrown catches matchedCatches"), matches: [fields("weaponId throwId thrownAt caughtAt")] } } }], metrics: fields("baselineReward challengerReward passed") },
  candidate: { artifact, receipt: fields("format schemaVersion artifactId artifactHash payloadHash protocolHash receiptHash") } };

function check(value: unknown, shape: Shape, path: string): void {
  // Required fields and values are enforced by the existing typed parsers.
  if (value === undefined) return;
  if (shape === "scalar") {
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
    throw new TypeError(`V3 derived evidence forbids nested payload at ${path}`);
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new TypeError(`invalid V3 derived evidence array at ${path}`);
    value.forEach((entry, index) => { check(entry, shape[0], `${path}[${String(index)}]`); });
    return;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`invalid V3 derived evidence object at ${path}`);
  if (shape === "numbers") {
    if (Object.values(value).some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) throw new TypeError(`invalid V3 derived evidence numeric map at ${path}`);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!Object.hasOwn(shape, key)) throw new TypeError(`V3 derived evidence forbids extension at ${path}.${key}`);
    const child = shape[key];
    if (child === undefined) throw new TypeError(`invalid V3 derived evidence schema at ${path}.${key}`);
    check(entry, child, `${path}.${key}`);
  }
}

export function assertTrainingArchiveV3DerivedRequest(value: unknown): void { check(value, request, "request"); }
export function assertTrainingOperationsV3JobPayload(value: unknown): void { check(value, job, "job"); }
export function assertTrainingOperationsV3CasePayload(value: unknown): void { check(value, [scenario], "cases"); }
export function assertTrainingOperationsV3DerivedReceiptPayload(value: unknown): void {
  check(value, { ...fields("format schemaVersion receiptHash"), sourceJob: job, job, evidence }, "receipt");
}
