import type {
  TearWatchAgentApi,
  TearWatchAgentOptions,
  TearWatchAgentSnapshot,
} from "./live-watch-agent-host";
import type { TearAgentProfileId } from "./contracts";

export function installLiveWatchAgentPanel(
  api: TearWatchAgentApi,
  defaults: Required<TearWatchAgentOptions>,
): void {
  const query = new URLSearchParams(window.location.search);
  if (query.get("watchagent") !== "1" || document.getElementById("tear-watch-agent") !== null) return;
  const root = document.createElement("section");
  root.id = "tear-watch-agent";
  root.setAttribute("aria-label", "Watch Agent");
  Object.assign(root.style, {
    position: "fixed", right: "12px", bottom: "12px", zIndex: "2147483645",
    width: "320px", padding: "12px", color: "#e9f6ff", background: "rgba(5,9,16,.92)",
    border: "1px solid #39d0ff", font: "12px/1.35 monospace", whiteSpace: "pre-wrap",
  });
  const title = document.createElement("strong"); title.textContent = "TEARBOT · WATCH AGENT";
  const fields = document.createElement("div");
  fields.setAttribute("aria-label", "Watch Agent selection");
  const select = <T extends string>(label: string, values: readonly T[], selected: T): HTMLSelectElement => {
    const wrapper = document.createElement("label");
    wrapper.textContent = `${label}: `;
    const control = document.createElement("select");
    control.setAttribute("aria-label", label);
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value; option.textContent = value; option.selected = value === selected;
      control.append(option);
    }
    wrapper.append(control, document.createElement("br"));
    fields.append(wrapper);
    return control;
  };
  const profile = select("Profile", [
    "smoke", "competent", "style", "survival", "chaos", "menu", "transition-hunter",
  ] as const, defaults.profile);
  const mode = select("Mode", [
    "campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox",
  ] as const, defaults.mode);
  const difficulty = select("Difficulty", [
    "easy", "normal", "hard", "extreme", "onehit",
  ] as const, defaults.difficulty);
  const weapon = select("Weapon", [
    "sword", "hammer", "spear", "chainblade", "ringblade",
  ] as const, defaults.weapon);
  const journey = select("Journey", [
    "single-run", "longitudinal-earned-profile",
  ] as const, defaults.journey);
  const seedLabel = document.createElement("label"); seedLabel.textContent = "Seed: ";
  const seed = document.createElement("input");
  seed.type = "number"; seed.value = String(defaults.seed); seed.min = "1"; seed.step = "1";
  seed.setAttribute("aria-label", "Seed"); seedLabel.append(seed); fields.append(seedLabel);
  const ceiling = (label: string, value: number): HTMLInputElement => {
    const wrapper = document.createElement("label"); wrapper.textContent = `${label}: `;
    const input = document.createElement("input");
    input.type = "number"; input.value = String(value); input.min = "1"; input.step = "1";
    input.setAttribute("aria-label", label); wrapper.append(input, document.createElement("br")); fields.append(wrapper);
    return input;
  };
  const maxEpisodes = ceiling("Max episodes", defaults.maxEpisodes);
  const maxSpend = ceiling("Max spend", defaults.maxSpend);
  const output = document.createElement("pre"); output.setAttribute("aria-live", "polite");
  const render = (snapshot: TearWatchAgentSnapshot): void => {
    const trace = snapshot.lastTrace;
    const intent = snapshot.structuredIntent;
    const criticNotes = intent?.critic ?? trace?.critic ?? [];
    const invariantNotes = intent?.invariantViolations ?? [];
    const hierarchyWatchdogs = intent?.watchdog.map((incident) => `${incident.kind}:${incident.severity}`) ?? [];
    const watchdogNotes = [...snapshot.watchdogs.active, ...hierarchyWatchdogs];
    output.textContent = [
      `Status: ${snapshot.status}`, `Screen: ${snapshot.screen}`, `Tick: ${String(snapshot.tick)}`,
      `Policy: ${snapshot.selection.profile}`,
      `Run: ${snapshot.selection.mode} / ${snapshot.selection.difficulty} / ${snapshot.selection.weapon}`,
      `Journey: ${snapshot.selection.journey ?? "single-run"}`,
      `Seed: ${String(snapshot.longitudinal?.currentSeed ?? snapshot.selection.seed)}`,
      `Objective: ${intent?.objective ?? trace?.objective ?? "awaiting-start"}`,
      `Target: ${intent?.targetId ?? trace?.targetId ?? "none"}`,
      `Maneuver: ${intent?.maneuver ?? trace?.maneuver ?? "none"}`,
      `Confidence: ${String(Math.round((intent?.confidence ?? trace?.confidence ?? 0) * 100))}%`,
      `Recovery: ${(intent?.recovery ?? trace?.recovery) === true ? "active" : "none"}`,
      `Critic: ${criticNotes.length > 0 ? criticNotes.join(", ") : "clear"}`,
      `Invariants: ${invariantNotes.length > 0 ? invariantNotes.join(", ") : "clear"}`,
      `Memory: ${String(intent?.memory.decisions ?? 0)} decisions / ${String(intent?.memory.recoveryAttempts ?? 0)} recoveries`,
      ...(snapshot.longitudinal === undefined ? [] : [
        `Earned profile: ${String(snapshot.longitudinal.currentEpisode)}/${String(snapshot.longitudinal.maxEpisodes)} episodes · ${String(snapshot.longitudinal.spent)}/${String(snapshot.longitudinal.maxSpend)}c spent`,
      ]),
      `Observation: ${snapshot.observationLabel}`,
      `Watchdogs: ${watchdogNotes.length > 0 ? watchdogNotes.join(", ") : "clear"} (progress ${String(snapshot.watchdogs.noProgressTicks)}/${String(snapshot.watchdogs.noProgressLimit)})`,
    ].join("\n");
  };
  const start = document.createElement("button"); start.textContent = "Start Watch Agent";
  start.addEventListener("click", () => {
    const numericSeed = Number(seed.value);
    if (!Number.isSafeInteger(numericSeed) || numericSeed < 1) throw new RangeError("Watch Agent seed must be positive");
    render(api.start({
      profile: profile.value as TearAgentProfileId,
      mode: mode.value as Required<TearWatchAgentOptions>["mode"],
      difficulty: difficulty.value as Required<TearWatchAgentOptions>["difficulty"],
      weapon: weapon.value as Required<TearWatchAgentOptions>["weapon"],
      journey: journey.value as Required<TearWatchAgentOptions>["journey"],
      maxEpisodes: Number(maxEpisodes.value),
      maxSpend: Number(maxSpend.value),
      seed: numericSeed,
    }));
  });
  const advance = document.createElement("button"); advance.textContent = "Run 2,000 ticks";
  advance.addEventListener("click", () => { render(api.run()); });
  const pause = document.createElement("button"); pause.textContent = "Pause";
  pause.addEventListener("click", () => { render(api.pause()); });
  const resume = document.createElement("button"); resume.textContent = "Resume";
  resume.addEventListener("click", () => { render(api.resume()); });
  const stop = document.createElement("button"); stop.textContent = "Stop";
  stop.addEventListener("click", () => { render(api.stop()); });
  root.append(title, document.createElement("br"), fields, start, advance, pause, resume, stop, output);
  document.body.append(root);
  render(api.snapshot());
}
