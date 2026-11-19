import type { TearBuildTarget } from "./contracts";

/** One work the game uses and the credit its licence asks the game to show. */
export interface Credit {
  readonly id: string;
  readonly name: string;
  /** What the game uses the work for, in a few words. */
  readonly use: string;
  /** The copyright line the licence asks to keep with the work. */
  readonly notice: string;
  /** The licence, by name. */
  readonly licence: string;
  /** Where the licence text ships with the build, relative to the page; null when it does not ship. */
  readonly licenceFile: string | null;
  /** The builds that contain the work; every build when omitted. */
  readonly builds?: readonly TearBuildTarget[];
}

export interface CreditGroup {
  readonly label: string;
  readonly credits: readonly Credit[];
}

const OFL = "SIL Open Font License 1.1";
const OFL_TEXT = "fonts/OFL.txt";

/**
 * Everything the Credits tab lists, in one table. A work belongs here when the game ships it or loads
 * it, so a new font, library or sound goes in this table and nowhere else (tests/unit/credits.test.ts
 * fails for a font file in public/fonts without an entry). Names and notices are taken from the
 * licence files: public/fonts/OFL.txt for the fonts, each package's own LICENSE for the libraries.
 */
export const CREDIT_GROUPS: readonly CreditGroup[] = Object.freeze([
  {
    label: "FONTS",
    credits: [
      {
        id: "barlow-condensed",
        name: "Barlow Condensed",
        use: "chapter titles",
        notice: "© 2017 The Barlow Project Authors",
        licence: OFL,
        licenceFile: OFL_TEXT,
      },
      {
        id: "ibm-plex-mono",
        name: "IBM Plex Mono",
        use: "text",
        notice: "© 2017 IBM Corp.",
        licence: OFL,
        licenceFile: OFL_TEXT,
      },
    ],
  },
  {
    label: "SOFTWARE",
    credits: [
      {
        id: "vite",
        name: "Vite",
        use: "builds the game and loads its modules",
        notice: "© 2019-present VoidZero Inc. and Vite contributors",
        licence: "MIT License",
        licenceFile: null,
      },
      {
        id: "workbox",
        name: "Workbox",
        use: "keeps the installed app working offline",
        notice: "© 2018 Google LLC",
        licence: "MIT License",
        licenceFile: null,
        builds: ["standalone"],
      },
      {
        id: "firebase",
        name: "Firebase JavaScript SDK",
        use: "accounts, cloud saves and leaderboards",
        notice: "© Google LLC",
        licence: "Apache License 2.0",
        licenceFile: null,
        builds: ["standalone"],
      },
    ],
  },
]);

/** The credits for one build: the works that build contains, in the table's order, without empty groups. */
export function creditsFor(target: TearBuildTarget): readonly CreditGroup[] {
  return CREDIT_GROUPS.map((group) => ({
    label: group.label,
    credits: group.credits.filter((credit) => credit.builds === undefined || credit.builds.includes(target)),
  })).filter((group) => group.credits.length > 0);
}
