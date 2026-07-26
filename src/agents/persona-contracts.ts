export type TearAgentPersonaCategory =
  | "core"
  | "hardware"
  | "performance"
  | "behavioral"
  | "qa-adversary";

export type TearAgentPersonaContractStatus = "contract-defined-uncertified";

export interface TearAgentPersonaContract {
  readonly id: string;
  readonly category: TearAgentPersonaCategory;
  readonly label: string;
  readonly objective: string;
  readonly behaviorDirectives: readonly string[];
  readonly requiredMetrics: readonly string[];
  readonly status: TearAgentPersonaContractStatus;
}

function persona(
  id: string,
  category: TearAgentPersonaCategory,
  label: string,
  objective: string,
  behaviorDirectives: readonly string[],
  requiredMetrics: readonly string[],
): TearAgentPersonaContract {
  return Object.freeze({
    id,
    category,
    label,
    objective,
    behaviorDirectives: Object.freeze([...behaviorDirectives]),
    requiredMetrics: Object.freeze([...requiredMetrics]),
    status: "contract-defined-uncertified",
  });
}

const CORE_PERSONAS = [
  persona("smoke", "core", "Smoke Bot", "Prove boot, run start, basic control, pause, restart, and clean exit.",
    ["prefer the shortest legal route", "exercise movement and one deliberate attack", "abort on invariant failure"],
    ["boot-success", "run-start-success", "basic-action-success", "clean-exit-success"]),
  persona("competent", "core", "Competent Player", "Clear representative content with balanced human-readable play.",
    ["rank threats", "maintain a legal build", "balance aggression and survival", "recover before abandoning"],
    ["completion-rate", "median-wave", "damage-taken", "recovery-success"]),
  persona("style", "core", "Style Player", "Exercise Tear's expressive combat mechanics deliberately.",
    ["prefer varied maneuvers", "seek launches and juggles", "attempt slams, throws, recalls, and parries"],
    ["mechanic-coverage", "style-variety", "combo-duration", "failed-maneuver-recovery"]),
  persona("survival", "core", "Survival Player", "Stress defense, sustain, shields, revives, and long encounters.",
    ["preserve dash charges", "prefer safe spacing", "value sustain and defense", "disengage at low health"],
    ["survival-time", "damage-avoided", "recovery-success", "defensive-resource-efficiency"]),
  persona("chaos", "core", "Chaos Bot", "Produce high-entropy but legal action combinations.",
    ["sample only advertised actions", "vary timing and combinations", "never inject state or invalid commands"],
    ["action-entropy", "invalid-action-count", "invariant-failures", "unique-transition-count"]),
  persona("transition-hunter", "core", "Transition Hunter", "Repeatedly stress legal lifecycle boundaries.",
    ["exercise pause and resume", "stress death, wave, boss, reward, and menu boundaries", "record every dwell timeout"],
    ["transition-count", "transition-latency", "recovery-attempts", "softlocks"]),
  persona("menu", "core", "Menu Agent", "Exercise focus, tabs, scrolling, confirmation, back, and post-run navigation.",
    ["visit every interactive route", "prefer semantic focus actions", "verify back-stack identity"],
    ["route-coverage", "focus-errors", "unreachable-controls", "menu-return-success"]),
] as const;

const HARDWARE_PERSONAS = [
  persona("hardware-keyboard-only", "hardware", "Keyboard-only Accessibility", "Complete supported journeys without pointer aim.",
    ["use keyboard-valid actions only", "exercise remapping and focus"], ["input-acceptance", "focus-loss", "completion-rate"]),
  persona("hardware-standard-mouse", "hardware", "Standard Mouse", "Establish the baseline pointer-control profile.",
    ["use default sensitivity", "preserve deliberate press and release"], ["aim-error", "input-latency", "completion-rate"]),
  persona("hardware-low-sensitivity-mouse", "hardware", "Low-sensitivity Mouse", "Test large pointer travel and edge recovery.",
    ["apply low sensitivity", "avoid synthetic turn teleportation"], ["aim-error", "edge-clamps", "mechanic-coverage"]),
  persona("hardware-high-sensitivity-mouse", "hardware", "High-sensitivity Mouse", "Test precision under amplified pointer motion.",
    ["apply high sensitivity", "limit overshoot through corrective motion"], ["overshoot-rate", "aim-error", "parry-success"]),
  persona("hardware-controller-default", "hardware", "Controller Default", "Exercise the shipped default controller preset.",
    ["use controller semantics", "exercise disconnect recovery"], ["input-acceptance", "disconnect-recovery", "completion-rate"]),
  persona("hardware-controller-additional-presets", "hardware", "Additional Controller Presets", "Exercise every configured non-default preset.",
    ["enumerate configured presets", "fail on an untested published preset"], ["preset-coverage", "glyph-mismatches", "completion-rate"]),
  persona("hardware-stick-drift", "hardware", "Stick Drift", "Test bounded unintended analog motion.",
    ["inject declared in-range drift", "verify deadzone behavior"], ["false-movement", "false-aim", "recovery-success"]),
  persona("hardware-high-deadzone", "hardware", "High Deadzone", "Test control viability near the supported deadzone limit.",
    ["apply declared high deadzone", "avoid privileged control scaling"], ["missed-inputs", "movement-onset", "completion-rate"]),
  persona("hardware-touch-radial-stick", "hardware", "Touch Radial Stick", "Exercise the radial-stick touch scheme.",
    ["use real touch geometry", "respect safe areas"], ["touch-capture", "gesture-loss", "completion-rate"]),
  persona("hardware-touch-relative-drag", "hardware", "Touch Relative Drag", "Exercise the relative-drag touch scheme.",
    ["use relative-drag aim", "recover cancelled contacts"], ["touch-capture", "aim-error", "cancel-recovery"]),
  persona("hardware-small-screen", "hardware", "Small Screen", "Prove controls and information remain usable at supported small viewports.",
    ["use supported minimum viewport", "respect occlusion and safe areas"], ["occluded-controls", "mis-taps", "completion-rate"]),
  persona("hardware-high-input-latency", "hardware", "High Input Latency", "Measure robustness under declared delayed input.",
    ["delay actions without reordering them", "record applied latency"], ["applied-latency", "late-actions", "completion-rate"]),
  persona("hardware-intermittent-input-loss", "hardware", "Intermittent Input Loss", "Test recovery from bounded dropped input.",
    ["drop actions by a deterministic schedule", "release held controls on loss"], ["dropped-actions", "stuck-controls", "recovery-success"]),
] as const;

const PERFORMANCE_PERSONAS = [
  persona("performance-30fps", "performance", "30 FPS Constrained", "Validate play at a stable 30 FPS render profile.",
    ["hold simulation at 120 Hz", "render at 30 FPS"], ["frame-time", "simulation-ticks", "completion-rate"]),
  persona("performance-45fps-unstable", "performance", "45 FPS Unstable", "Stress irregular mid-rate rendering.",
    ["use a deterministic jitter schedule", "preserve fixed-step truth"], ["frame-time-p95", "tick-drift", "completion-rate"]),
  persona("performance-60fps", "performance", "60 FPS Baseline", "Establish the standard render baseline.",
    ["render at 60 FPS", "retain the canonical seed"], ["frame-time", "semantic-hash", "completion-rate"]),
  persona("performance-120fps", "performance", "120 FPS", "Validate high-refresh rendering.",
    ["render at 120 FPS", "compare against 60 FPS semantics"], ["frame-time", "semantic-hash", "tick-drift"]),
  persona("performance-144plus-fps", "performance", "144+ FPS", "Validate supported very-high-refresh rendering.",
    ["render above 144 FPS where supported", "compare semantic hashes"], ["frame-time", "semantic-hash", "tick-drift"]),
  persona("performance-periodic-long-frame", "performance", "Periodic Long Frame", "Stress accumulator recovery after long frames.",
    ["inject deterministic long frames", "record catch-up bounds"], ["long-frame-count", "catch-up-ticks", "semantic-hash"]),
  persona("performance-cpu-constrained", "performance", "CPU Constrained", "Measure gameplay and watchdog behavior under CPU pressure.",
    ["apply a declared CPU budget", "do not change game rules"], ["cpu-time", "frame-time-p95", "watchdog-failures"]),
  persona("performance-effects-constrained", "performance", "GPU/Effects Constrained", "Measure effects-heavy rendering pressure.",
    ["use the shipped effects path", "record active entity and effect counts"], ["frame-time-p95", "effect-count", "completion-rate"]),
  persona("performance-background-resume", "performance", "Background Pause/Resume", "Validate lifecycle pause and deterministic resume.",
    ["background through the production lifecycle", "release transient input"], ["pause-ticks", "resume-latency", "stuck-controls"]),
  persona("performance-viewport-change", "performance", "Orientation/Viewport Change", "Validate supported live viewport changes.",
    ["resize through the production path", "preserve authoritative state"], ["layout-errors", "state-hash", "completion-rate"]),
] as const;

const BEHAVIORAL_PERSONAS = [
  ["behavior-cautious", "Cautious", "prefer spacing, defense, and low-risk routes"],
  ["behavior-aggressive", "Aggressive", "close distance and accept bounded combat risk"],
  ["behavior-score-greedy", "Score Greedy", "pursue score without violating survival constraints"],
  ["behavior-style-focused", "Style Focused", "maximize varied expressive maneuvers"],
  ["behavior-speedrunner", "Speedrunner", "minimize safe journey and combat time"],
  ["behavior-completionist", "Completionist", "exercise every available legal objective"],
  ["behavior-defensive-parry", "Defensive Parry", "prefer readable projectile counters"],
  ["behavior-throw-heavy", "Throw Heavy", "prefer throw and recall routes"],
  ["behavior-low-mechanics", "Low Mechanics", "use simple low-frequency maneuvers"],
  ["behavior-panic-input", "Panic Input", "produce bursts of legal imprecise actions under threat"],
  ["behavior-hesitant-menu", "Hesitant Menu", "delay and revisit menu choices without deadlocking"],
].map(([id, label, directive]) => persona(id ?? "", "behavioral", label ?? "", `Model the ${label ?? ""} play style.`,
  [directive ?? ""], ["completion-rate", "action-frequency", "damage-taken", "mechanic-coverage"]));

const QA_PERSONAS = [
  persona("qa-chaos", "qa-adversary", "QA Chaos", "Search high-entropy legal action combinations.",
    ["vary actions and timing", "never use invalid commands"], ["action-entropy", "invariant-failures", "softlocks"]),
  persona("qa-exploit-hunter", "qa-adversary", "Exploit Hunter", "Seek score, invulnerability, collision, and progression exploits.",
    ["maximize suspicious gains", "retain a reproducible transcript"], ["score-rate", "damage-immunity", "boundary-violations"]),
  persona("qa-softlock-hunter", "qa-adversary", "Softlock Hunter", "Seek states where progress cannot continue.",
    ["stress no-progress states", "defer recovery until evidence is captured"], ["dwell-time", "recovery-attempts", "softlocks"]),
  persona("qa-boundary-hunter", "qa-adversary", "Boundary Hunter", "Stress world bounds, platforms, void, and overscan.",
    ["target declared boundaries", "retain collision and viewport evidence"], ["boundary-contacts", "falls", "invalid-positions"]),
  persona("qa-transition-hunter", "qa-adversary", "QA Transition Hunter", "Stress pause, death, wave, boss, draft, and menu transitions.",
    ["repeat legal transition edges", "capture first stalled edge"], ["transition-count", "transition-latency", "softlocks"]),
  persona("qa-economy-attacker", "qa-adversary", "Economy Attacker", "Seek duplicate rewards, negative balances, and save manipulation defects.",
    ["repeat reward boundaries", "compare earned and applied ledgers"], ["duplicate-rewards", "negative-balances", "ledger-mismatches"]),
  persona("qa-replay-breaker", "qa-adversary", "Replay Breaker", "Seek runs that cannot replay or verify.",
    ["stress unusual legal action streams", "compare replay and live hashes"], ["replay-drift", "verification-failures", "unsupported-actions"]),
] as const;

export const TEAR_AGENT_PERSONA_CONTRACTS: readonly TearAgentPersonaContract[] = Object.freeze([
  ...CORE_PERSONAS,
  ...HARDWARE_PERSONAS,
  ...PERFORMANCE_PERSONAS,
  ...BEHAVIORAL_PERSONAS,
  ...QA_PERSONAS,
]);

export function agentPersonaContract(id: string): TearAgentPersonaContract | undefined {
  return TEAR_AGENT_PERSONA_CONTRACTS.find((entry) => entry.id === id);
}
