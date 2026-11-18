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
  goal: "Swing through the dummy.",
  why: "Speed is damage.",
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

  it("steps back to a short count as soon as the lesson counts evidence", () => {
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

  it("names what was learned and why, then holds the next goal until it has played", () => {
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
    expect(ids(marks)).toEqual(["lesson:4:LAUNCH:prompt"]);
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
    coach.step(frame({ tutorial: lesson() }));
    expect(ids(coach.step(frame({ tutorial: lesson({ key: "4:LAUNCH", title: "LAUNCH" }) })))).toEqual([
      "lesson:4:LAUNCH:prompt",
    ]);
    expect(ids(coach.step(frame({ tutorial: lesson({ key: "13:READY", final: true }) })))).toEqual([]);
  });

  it("shows the Playground help once per run, worded for the device", () => {
    const run = {};
    const coach = new TrainingCoach();
    const marks = coach.step(frame({ playground: { runKey: run } }));
    expect(marks[0]?.mark).toMatchObject({ id: "playground:help", tone: "info" });
    expect(marks[0]?.mark.text).toBe("E menu  ·  U abilities  ·  1–8 spawn");
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
