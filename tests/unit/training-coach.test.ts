import { describe, expect, it } from "vitest";
import {
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
    expect(marks[0]?.mark.text).toBe("TAB menu  ·  U abilities  ·  1–8 spawn");
    let later = marks;
    for (let elapsed = 0; elapsed < COACH_HELP_SECONDS + 1; elapsed += 1)
      later = coach.step(frame({ deltaSeconds: 1, playground: { runKey: run } }));
    expect(ids(later)).toEqual([]);
    expect(ids(coach.step(frame({ playground: { runKey: run, arena: 2 } })))).toEqual(["playground:help"]);
    // Touch and controller have no shortcuts: the help points at pause, which opens the menu.
    for (const inputMode of ["touch", "gamepad"] as const) {
      const help = new TrainingCoach().step(frame({ inputMode, playground: { runKey: run } }))[0]?.mark;
      expect(help).toMatchObject({ id: "playground:help", text: "Pause for the Playground menu.", keys: ["PAUSE"] });
    }
  });
});
