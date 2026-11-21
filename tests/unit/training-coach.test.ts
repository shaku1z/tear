import { describe, expect, it } from "vitest";
import {
  COACH_CALLOUT_SECONDS,
  COACH_HELP_SECONDS,
  COACH_IDLE_SECONDS,
  COACH_LEARNED_SECONDS,
  COACH_STEP_SECONDS,
  TrainingCoach,
  type TrainingCoachFrame,
  type TutorialCoachInput,
} from "../../src/app/training/training-coach";

const lesson = (overrides: Partial<TutorialCoachInput> = {}): TutorialCoachInput => ({
  key: "3:CUT",
  kind: "lesson",
  title: "CUT",
  why: "Speed is damage.",
  progress: [0, 3],
  completing: false,
  final: false,
  ...overrides,
});

const frame = (overrides: Partial<TrainingCoachFrame> = {}): TrainingCoachFrame => ({
  deltaSeconds: 1 / 60,
  reducedMotion: false,
  inputMode: "mouse",
  padLabel: (binding) => binding.toUpperCase(),
  player: { x: 300, y: 600 },
  ...overrides,
});

const ids = (marks: ReturnType<TrainingCoach["step"]>): string[] => marks.map((entry) => entry.mark.id);

describe("training coach", () => {
  it("leaves the instruction to the exercise card: nothing at the player when a lesson starts", () => {
    for (const inputMode of ["mouse", "touch", "gamepad"] as const)
      expect(ids(new TrainingCoach().step(frame({ inputMode, tutorial: lesson() })))).toEqual([]);
  });

  it("shows a short count at the player for each counted step", () => {
    const coach = new TrainingCoach();
    coach.step(frame({ tutorial: lesson() }));
    const marks = coach.step(frame({ tutorial: lesson({ progress: [1, 3] }) }));
    expect(ids(marks)).toEqual(["beat:3:CUT:1"]);
    expect(marks[0]?.mark).toMatchObject({ text: "1 of 3", channel: "beat", anchor: { x: 300, y: 600 } });
    let later = marks;
    for (let elapsed = 0; elapsed < COACH_STEP_SECONDS + 0.5; elapsed += 0.1)
      later = coach.step(frame({ deltaSeconds: 0.1, tutorial: lesson({ progress: [1, 3] }) }));
    expect(ids(later)).toEqual([]);
  });

  it("names what was learned and why, and lets it finish over the next lesson", () => {
    const coach = new TrainingCoach();
    coach.step(frame({ tutorial: lesson() }));
    const done = coach.step(frame({ tutorial: lesson({ progress: [3, 3], completing: true }) }));
    expect(done.map((entry) => entry.mark)).toEqual([
      expect.objectContaining({ id: "beat:3:CUT:learned", title: "LEARNED · CUT", text: "Speed is damage." }),
    ]);
    const next = lesson({ key: "4:LAUNCH", title: "LAUNCH" });
    expect(ids(coach.step(frame({ tutorial: next })))).toEqual(["beat:3:CUT:learned"]);
    let marks = done;
    for (let elapsed = 0; elapsed < COACH_LEARNED_SECONDS + 0.5; elapsed += 0.1)
      marks = coach.step(frame({ deltaSeconds: 0.1, tutorial: next }));
    expect(ids(marks)).toEqual([]);
    const weapon = new TrainingCoach();
    weapon.step(frame({ tutorial: lesson({ kind: "weapon", key: "weapon:hammer:0", title: "HAMMER" }) }));
    expect(
      weapon.step(
        frame({ tutorial: lesson({ kind: "weapon", key: "weapon:hammer:0", title: "HAMMER", completing: true }) }),
      )[0]?.mark.title,
    ).toBe("DONE · HAMMER");
  });

  it("offers the demonstration after a stall, with the pause control for the device", () => {
    const coach = new TrainingCoach();
    let marks = coach.step(frame({ inputMode: "gamepad", tutorial: lesson() }));
    for (let elapsed = 0; elapsed <= COACH_IDLE_SECONDS + 0.1; elapsed += 0.1)
      marks = coach.step(frame({ inputMode: "gamepad", deltaSeconds: 0.1, tutorial: lesson() }));
    expect(marks[0]?.mark).toMatchObject({ id: "lesson:3:CUT:stuck", tone: "nudge", keys: ["PAUSE"] });
    marks = coach.step(frame({ inputMode: "gamepad", tutorial: lesson({ progress: [1, 3] }) }));
    expect(ids(marks)).toEqual(["beat:3:CUT:1"]);
  });

  it("restarts for a new lesson and stays silent on the final hand-off", () => {
    const coach = new TrainingCoach();
    let marks = coach.step(frame({ tutorial: lesson() }));
    for (let elapsed = 0; elapsed <= COACH_IDLE_SECONDS + 0.1; elapsed += 0.1)
      marks = coach.step(frame({ deltaSeconds: 0.1, tutorial: lesson() }));
    expect(ids(marks)).toEqual(["lesson:3:CUT:stuck"]);
    // A new lesson clears the old lesson's marks and restarts the stall clock.
    expect(ids(coach.step(frame({ tutorial: lesson({ key: "4:LAUNCH", title: "LAUNCH" }) })))).toEqual([]);
    expect(ids(coach.step(frame({ tutorial: lesson({ key: "13:READY", final: true }) })))).toEqual([]);
  });

  it("shows the Playground help once per run, worded for the device", () => {
    const run = {};
    const coach = new TrainingCoach();
    const marks = coach.step(frame({ playground: { runKey: run } }));
    expect(marks[0]?.mark).toMatchObject({ id: "playground:help", tone: "info" });
    expect(marks[0]?.mark.text).toBe("TAB menu  ·  1 heal  ·  2 clear  ·  3 dummy  ·  4 repeat");
    let later = marks;
    for (let elapsed = 0; elapsed < COACH_HELP_SECONDS + 1; elapsed += 1)
      later = coach.step(frame({ deltaSeconds: 1, playground: { runKey: run } }));
    expect(ids(later)).toEqual([]);
    expect(ids(coach.step(frame({ playground: { runKey: run, arena: 2 } })))).toEqual(["playground:help"]);
    // A controller names its View layer; touch has no shortcuts, so the help points at pause.
    const pad = new TrainingCoach().step(frame({ inputMode: "gamepad", playground: { runKey: run } }))[0]?.mark;
    expect(pad?.text).toBe("VIEW menu  ·  VIEW + ↑ heal  ·  VIEW + ↓ clear  ·  VIEW + ← dummy  ·  VIEW + → repeat");
    const touch = new TrainingCoach().step(frame({ inputMode: "touch", playground: { runKey: run } }))[0]?.mark;
    expect(touch).toMatchObject({ id: "playground:help", text: "Pause for the Playground menu.", keys: ["PAUSE"] });
  });

  it("gives each new arena the full help time, even when the last help is still showing", () => {
    const run = {};
    const coach = new TrainingCoach();
    coach.step(frame({ playground: { runKey: run, arena: 0 } }));
    coach.step(frame({ deltaSeconds: COACH_HELP_SECONDS - 3, playground: { runKey: run, arena: 0 } }));
    coach.step(frame({ playground: { runKey: run, arena: 1 } }));
    // Past the first help's end: the second arena's help still has time left.
    const later = coach.step(frame({ deltaSeconds: COACH_HELP_SECONDS - 1, playground: { runKey: run, arena: 1 } }));
    expect(ids(later)).toEqual(["playground:help"]);
  });

  it("shows the help in full for each of two arena changes a few seconds apart", () => {
    const run = {};
    const coach = new TrainingCoach();
    const at = (arena: number, deltaSeconds = 1 / 60) =>
      coach.step(frame({ deltaSeconds, playground: { runKey: run, arena } }));
    at(0);
    at(0, 2);
    at(1);
    at(1, 2);
    // The second change starts the help again with its whole time ahead: still on screen
    // almost a full help time later, though the first help began more than that ago.
    at(2);
    expect(ids(at(2, COACH_HELP_SECONDS - 0.5))).toEqual(["playground:help"]);
    expect(ids(at(2, 1))).toEqual([]);
  });

  it("plates a call-out beside what it names, and gives a repeated call-out its full time", () => {
    const coach = new TrainingCoach();
    const enemy = { x: 880, y: 500, w: 40, h: 40 };
    const first = coach.step(frame({ callouts: [{ text: "GRUNT", tone: "info", target: enemy }] }));
    expect(first.map((entry) => entry.mark)).toEqual([
      expect.objectContaining({ title: "GRUNT", text: "", target: enemy, backing: "plate", channel: "callout" }),
    ]);
    coach.step(frame({ deltaSeconds: COACH_CALLOUT_SECONDS - 0.2 }));
    // A second HEALED (no anchor: at the player) replaces the first and restarts.
    coach.step(frame({ callouts: [{ text: "HEALED", tone: "info" }] }));
    const later = coach.step(frame({ deltaSeconds: COACH_CALLOUT_SECONDS - 0.2 }));
    expect(later.map((entry) => entry.mark)).toEqual([
      expect.objectContaining({ title: "HEALED", anchor: { x: 300, y: 600 } }),
    ]);
  });
});
