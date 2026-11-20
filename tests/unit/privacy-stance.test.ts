import { describe, expect, it } from "vitest";
import { privacyStanceFor, OWN_PRIVACY_PAGE } from "../../src/platform/privacy-stance";
import { createStatisticsChoice, statisticsAllowed } from "../../src/platform/statistics-consent";

describe("privacy stance per build", () => {
  it("points the standalone build at its own page and offers no terms", () => {
    const stance = privacyStanceFor("standalone");
    expect(stance).toMatchObject({ privacyUrl: OWN_PRIVACY_PAGE, termsUrl: null, sendsStatistics: true });
  });

  it("leaves the portal its own links and sends nothing to our cloud", () => {
    const stance = privacyStanceFor("crazygames");
    expect(stance.privacyUrl).toMatch(/^https:\/\/www\.crazygames\.com\//);
    expect(stance.termsUrl).toMatch(/^https:\/\/www\.crazygames\.com\//);
    expect(stance.sendsStatistics).toBe(false);
  });

  it("tells the itch build's player that progress stays in the browser, with no links", () => {
    expect(privacyStanceFor("itch")).toEqual({
      privacyUrl: null,
      termsUrl: null,
      note: "Progress is stored only in this browser.",
      sendsStatistics: false,
    });
  });
});

describe("statistics gate", () => {
  const standalone = privacyStanceFor("standalone");
  const gate = (overrides: { share?: boolean; seen?: boolean; target?: "standalone" | "crazygames" | "itch" } = {}) =>
    statisticsAllowed({
      stance: privacyStanceFor(overrides.target ?? "standalone"),
      choice: { share: overrides.share ?? true },
      noticeAcknowledged: () => overrides.seen ?? true,
    });

  it("starts on", () => {
    expect(createStatisticsChoice()).toEqual({ share: true });
    expect(standalone.sendsStatistics).toBe(true);
  });

  it("sends only when the build sends, the player has not opted out, and the notice was seen", () => {
    expect(gate()).toBe(true);
    expect(gate({ share: false })).toBe(false);
    expect(gate({ seen: false })).toBe(false);
    expect(gate({ target: "crazygames" })).toBe(false);
    expect(gate({ target: "itch" })).toBe(false);
  });

  it("reads the choice at the moment of each send", () => {
    const choice = createStatisticsChoice();
    const allowed = () => statisticsAllowed({ stance: standalone, choice, noticeAcknowledged: () => true });
    expect(allowed()).toBe(true);
    choice.share = false;
    expect(allowed()).toBe(false);
  });
});
