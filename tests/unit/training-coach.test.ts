import { describe, expect, it } from "vitest";
import {
  COACH_HELP_SECONDS,
  COACH_IDLE_SECONDS,
  TrainingCoach,
  type TrainingCoachFrame,
  type TutorialCoachInput,
} from "../../src/app/training/training-coach";

const lesson = (overrides: Partial<TutorialCoachInput> = {}): TutorialCoachInput => ({
  key: "3:CUT",
  title: "CUT",
  goal: "Swing through the dummy.",
  actions: ["swing"],
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
  it("prompts at the player when a lesson starts, worded for the device", () => {
    const keyboard = new TrainingCoach().step(frame({ tutorial: lesson() }));
    expect(keyboard[0]?.mark).toMatchObject({
      id: "lesson:3:CUT:prompt",
      keys: ["MOUSE"],
      anchor: { x: 300, y: 600 },
    });
    const touch = new TrainingCoach().step(frame({ inputMode: "touch", tutorial: lesson() }));
    expect(touch[0]?.mark.keys).toEqual(["DRAG"]);
  });

  it("steps back as soon as the lesson counts evidence", () => {
    const coach = new TrainingCoach();
    coach.step(frame({ tutorial: lesson() }));
    expect(ids(coach.step(frame({ tutorial: lesson({ progress: [1, 3] }) })))).toEqual([]);
  });

  it("offers the demonstration after a stall, with the pause control for the device", () => {
    const coach = new TrainingCoach();
    let marks = coach.step(frame({ inputMode: "gamepad", tutorial: lesson() }));
    for (let elapsed = 0; elapsed <= COACH_IDLE_SECONDS + 0.1; elapsed += 0.1)
      marks = coach.step(frame({ inputMode: "gamepad", deltaSeconds: 0.1, tutorial: lesson() }));
    expect(marks[0]?.mark).toMatchObject({ id: "lesson:3:CUT:stuck", tone: "nudge", keys: ["PAUSE"] });
    marks = coach.step(frame({ inputMode: "gamepad", tutorial: lesson({ progress: [1, 3] }) }));
    expect(ids(marks)).toEqual([]);
  });

  it("restarts for a new lesson and stays silent on the final hand-off", () => {
    const coach = new TrainingCoach();
    coach.step(frame({ tutorial: lesson() }));
    expect(ids(coach.step(frame({ tutorial: lesson({ key: "4:LAUNCH", title: "LAUNCH" }) })))).toEqual([
      "lesson:4:LAUNCH:prompt",
    ]);
    expect(ids(coach.step(frame({ tutorial: lesson({ key: "13:READY", final: true }) })))).toEqual([]);
  });

  it("shows the Playground shortcuts once per run, on keyboard only", () => {
    const run = {};
    const coach = new TrainingCoach();
    const marks = coach.step(frame({ playground: { runKey: run } }));
    expect(marks[0]?.mark).toMatchObject({ id: "playground:help", tone: "info" });
    expect(marks[0]?.mark.text).toContain("E build menu");
    let later = marks;
    for (let elapsed = 0; elapsed < COACH_HELP_SECONDS + 1; elapsed += 1)
      later = coach.step(frame({ deltaSeconds: 1, playground: { runKey: run } }));
    expect(ids(later)).toEqual([]);
    expect(ids(coach.step(frame({ playground: { runKey: run, arena: 2 } })))).toEqual(["playground:help"]);
    for (const inputMode of ["touch", "gamepad"] as const)
      expect(ids(new TrainingCoach().step(frame({ inputMode, playground: { runKey: run } })))).toEqual([]);
  });
});
