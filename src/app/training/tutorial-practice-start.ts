/**
 * Marks the run start in progress as a tutorial practice start, so world
 * preparation keeps the tutorial session it would otherwise clear.
 */
export interface LiveTutorialPracticeStart {
  readonly active: () => boolean;
  readonly start: (practice: boolean, begin: () => void) => void;
}

export function createLiveTutorialPracticeStart(): LiveTutorialPracticeStart {
  let practiceStart = false;
  return Object.freeze({
    active: () => practiceStart,
    start(practice: boolean, begin: () => void): void {
      practiceStart = practice;
      try {
        begin();
      } finally {
        practiceStart = false;
      }
    },
  });
}
