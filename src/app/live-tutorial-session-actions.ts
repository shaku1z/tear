import type { LiveTrainingHost } from "./live-training-host";
import type { LiveTutorialRuntime } from "../gameplay/training/live-tutorial-runtime";
import type { ScreenAction } from "../domain/screen-actions";

type TutorialCommand = Extract<ScreenAction, { type: "tutorial.action" }>["command"];
interface TutorialSessionActionPorts {
  readonly training: Pick<LiveTrainingHost, "ensureLoaded" | "openPractice">;
  readonly tutorial: LiveTutorialRuntime;
  readonly screen: () => string;
  readonly mode: () => string;
  readonly startLessonRun: () => void;
  readonly selectBaselineWeapon: () => void;
  readonly resetFocus: () => void;
  readonly resume: () => void;
}

/** Normal menu entry and existing paused lesson actions share one session owner. */
export function createLiveTutorialSessionActions(ports: TutorialSessionActionPorts) {
  let opening = false;
  const dispatch = (command: TutorialCommand, lessonId?: string): void => {
    if (command === "open-practice") {
      if (opening || (ports.screen() !== "menu" && ports.screen() !== "setup")) return;
      opening = true;
      void ports.training.ensureLoaded().then(() => {
        if (ports.screen() !== "menu" && ports.screen() !== "setup") return;
        if (ports.training.openPractice()) ports.resetFocus();
      }).catch((error: unknown) => { console.warn("Tear practice runtime failed to load", error); })
        .finally(() => { opening = false; });
      return;
    }
    const tutorial = ports.tutorial;
    if (ports.screen() !== "paused" || (ports.mode() !== "tutorial" && !(ports.mode() === "playground" && tutorial.session().phase === "free-practice"))) return;
    if (command === "help") { tutorial.showHelp(); return; }
    if (ports.mode() === "playground") {
      const target = command === "restart" ? tutorial.session().lessonId : lessonId;
      if ((command !== "select" && command !== "restart") || !tutorial.session().lessons.some((lesson) => lesson.id === target && lesson.canPractice)) return;
      const saved = tutorial.captureSession(), display = tutorial.capturePresentation();
      ports.selectBaselineWeapon(); ports.startLessonRun();
      tutorial.restoreSession(saved); tutorial.restorePresentation(display);
    }
    const changed = command === "demo" ? tutorial.demonstrate() : command === "restart" ? tutorial.restart() : tutorial.selectLesson(lessonId ?? "");
    if (changed) { ports.resetFocus(); ports.resume(); }
  };
  return Object.freeze({ dispatch });
}
