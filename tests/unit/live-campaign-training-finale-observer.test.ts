import { describe, expect, it, vi } from "vitest";

import type { LiveCampaignTrainingOptions } from "../../src/app/live-campaign-training-composition";

const forwarding = vi.hoisted((): { services: unknown } => ({ services: undefined }));

vi.mock("../../src/app/live-campaign-host", () => ({
  createLiveCampaignHost: (services: unknown) => {
    forwarding.services = services;
    return {
      cinema: {}, stage: {},
      story: {
        finale: null, lastCinemaPlayerMode: null,
        finaleController: { markLanded: () => undefined }, syncFinale: () => null,
      },
      runtime: { tryFinaleBladeCut: () => undefined },
    };
  },
}));
vi.mock("../../src/gameplay/combat/live-weapon-runtime", () => ({
  createLiveWeaponRuntime: () => ({ addFlash: vi.fn(), addShake: vi.fn(), shieldAbsorb: vi.fn() }),
}));
vi.mock("../../src/app/live-training-host", () => ({ createLiveTrainingHost: () => ({ tutorial: {} }) }));
vi.mock("../../src/app/live-cinematic-host", () => ({ createLiveCinematicHost: () => ({}) }));
vi.mock("../../src/app/live-source-void-controller", () => ({ createLiveSourceVoidController: () => ({}) }));
vi.mock("../../src/app/live-style-host", () => ({ createLiveStyleHost: () => ({}) }));

import { createLiveCampaignTrainingComposition } from "../../src/app/live-campaign-training-composition";

describe("live campaign/training composition finale observation", () => {
  it("passes the observer callback directly into the campaign host services", () => {
    const observer = vi.fn();
    const options = {
      dependencies: {}, entities: {}, state: {}, lifecycle: {}, cinema: {},
      controllers: { api: {}, installStage: vi.fn() },
      observeFinaleIntents: observer,
    } as unknown as LiveCampaignTrainingOptions;

    createLiveCampaignTrainingComposition(options);

    expect((forwarding.services as { observeFinaleIntents?: unknown }).observeFinaleIntents).toBe(observer);
  });
});
