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
    const outwardObserver = vi.fn();
    const options = {
      dependencies: {}, entities: {}, state: {}, lifecycle: {}, cinema: {},
      controllers: { api: {}, installStage: vi.fn() },
      observeFinaleIntents: observer,
      observeFinaleOutwardCall: outwardObserver,
    } as unknown as LiveCampaignTrainingOptions;

    createLiveCampaignTrainingComposition(options);

    expect((forwarding.services as { observeFinaleIntents?: unknown }).observeFinaleIntents).toBe(observer);
    expect((forwarding.services as { observeFinaleOutwardCall?: unknown }).observeFinaleOutwardCall).toBe(outwardObserver);
  });

  it("returns exact maximum-aggregation receipts for finale flash and shake", () => {
    let flash = 0.8, shake = 12;
    const options = {
      dependencies: {}, entities: {}, state: {}, lifecycle: {}, cinema: {},
      controllers: { api: {}, installStage: vi.fn() },
      getFlash: () => flash, setFlash: (value: number) => { flash = value; },
      getShake: () => shake, setShake: (value: number) => { shake = value; },
    } as unknown as LiveCampaignTrainingOptions;

    createLiveCampaignTrainingComposition(options);
    const services = forwarding.services as {
      addFlash(amount: number): unknown;
      addShake(amount: number): unknown;
    };

    expect(services.addFlash(0.6)).toEqual({
      requested: 0.6, before: 0.8, after: 0.8, aggregation: "maximum",
    });
    expect(services.addShake(9)).toEqual({
      requested: 9, before: 12, after: 12, aggregation: "maximum",
    });
    expect(flash).toBe(0.8);
    expect(shake).toBe(12);
  });
});
