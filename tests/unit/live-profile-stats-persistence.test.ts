import { practiceBossCatalog } from "../../src/gameplay/training/practice-boss-catalog";
import { describe, expect, it, vi } from "vitest";

import { createLiveProfileStatsPersistence } from "../../src/app/progress/profile-stats-persistence";
import { createLivePracticeEncounterPersistence } from "../../src/app/progress/practice-encounter-persistence";
import { createLegacyProfile } from "../../src/persistence/legacy-profile";
import { createLegacyPlatformCompatibility } from "../../src/platform/legacy-compat";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";

function encounterBacking() {
  const values = new Map<string, string>(); let blocked = false, writes = 0;
  const { CG } = createLegacyPlatformCompatibility({ target: "standalone", storage: {
    getItem: (key) => values.get(key) ?? null, removeItem: (key) => { values.delete(key); },
    setItem(key, value) { if (key === "tear_profile_v2") { if (blocked) throw new Error("quota"); writes++; } values.set(key, value); },
  } });
  const load = () => { const profile = createLegacyProfile({ store: CG.store, writerId: () => "encounter-test", getAchievements: () => undefined, getMeta: () => undefined }); profile.load(); return profile; };
  const profile = load(), authority = createLivePracticeEncounterPersistence(profile);
  const replay = createProductionReplayWorld({ seed: "ordinary-exposure", enemies: [{ id: "charger", x: 400, y: 700 }] });
  const run = replay.world.state.run(); if (!run) throw new Error("ordinary exposure run missing");
  const actor = replay.world.state.enemies()[0]; if (!actor) throw new Error("ordinary exposure actor missing");
  Object.assign(actor, { spawnT: 0 });
  const context = { run, actors: [actor], tick: 1, playing: true, waveActive: true, blockingCinema: false, ghostPractice: false, width: 1600, height: 900 };
  return { values, profile, authority, replay, run, actor, context, load, block: (value: boolean) => { blocked = value; }, writes: () => writes };
}

describe("live profile stats persistence adapter", () => {
  it.each(["reference", "challenger"])("does not persist natural encounter exposure for Race %s", (role) => {
    const fixture = encounterBacking();
    Object.assign(fixture.run, { seedRace: { role } });
    fixture.authority.trackSpawn(fixture.actor, fixture.run);
    const before = [...fixture.values], writes = fixture.writes();
    expect(fixture.authority.observe(fixture.context)).toBeUndefined();
    expect(fixture.profile.stat("encounterEnemy:charger")).toBe(0);
    expect([...fixture.values]).toEqual(before); expect(fixture.writes()).toBe(writes);
  });
  it("keeps exact boss phases independent and failed acknowledgements locked without tick retries", async () => {
    const fixture = encounterBacking(), { authority, profile, run, context } = fixture;
    profile.maxStat("killColossus", 1);
    expect(authority.bossCatalog().find((entry) => entry.id === "colossus:1")).toMatchObject({ knowledge: "defeated-identity", canPractice: true });
    expect(authority.bossCatalog().find((entry) => entry.id === "colossus:2")?.canPractice).toBe(false);
    expect(authority.bossCatalog().some((entry) => entry.bossId === ("white-hart" as string))).toBe(false);
    const boss = fixture.replay.world.entities.createEnemy("warden", 600, 700, run);
    Object.assign(boss, { bossId: "warden", spawnT: 0 }); authority.trackSpawn(boss, run);
    expect(await authority.observe({ ...context, actors: [boss] })).toBe("committed");
    expect(authority.bossCatalog().find((entry) => entry.id === "warden:1")?.canPractice).toBe(true);
    const echo = new fixture.replay.factories.mirrorTypes.MirrorHost(700, 700);
    expect(Reflect.get(echo, "bossId")).toBeUndefined();
    echo._live = true;
    authority.trackSpawn(echo, run);
    expect(authority.observe({ ...context, actors: [echo] })).toBeUndefined(); // An unattached preview/host is not exposure.
    fixture.replay.factories.mirrorTypes.Mirror.attach(echo, null);
    expect(await authority.observe({ ...context, actors: [echo] })).toBe("committed");
    expect(authority.bossCatalog().find((entry) => entry.id === "echo:1")?.canPractice).toBe(true);
    expect(authority.observe({ ...context, actors: [echo] })).toBeUndefined();
    expect(authority.bossCatalog().find((entry) => entry.id === "echo:2")?.canPractice).toBe(false);
    // The typed actor-entry boundary is separately exercised by all eighteen real authored entries.
    Object.assign(boss, { practicePhaseEntry: () => ({ phase: 2, targetPhase: 2, ready: true, stage: "combat" }) });
    fixture.block(true);
    expect(authority.observe({ ...context, actors: [boss], blockingCinema: true })).toBeUndefined();
    expect(authority.observe({ ...context, actors: [boss], run: { mode: "tutorial" } })).toBeUndefined();
    expect(await authority.observe({ ...context, actors: [boss] })).toBe("unknown");
    expect(authority.bossCatalog().find((entry) => entry.id === "warden:2")).toMatchObject({ knowledge: "save-unconfirmed", canPractice: false });
    expect(authority.observe({ ...context, actors: [boss] })).toBeUndefined();
    expect(authority.bossCatalog().find((entry) => entry.id === "warden:3")?.canPractice).toBe(false);
    expect(practiceBossCatalog((key) => fixture.load().stat(key)).find((entry) => entry.id === "warden:2")?.canPractice).toBe(false);
    expect(profile.stat("tutorialDone")).toBe(0); expect(profile.stat("coinsEarned")).toBe(0);
  });

  it("acknowledges genuine ordinary exposure once, preserves subtype/legacy unknowns and excludes practice or reconstructed actors", async () => {
    const fixture = encounterBacking(), { authority, profile, actor, context } = fixture;
    profile.maxStat("kill_armored", 2); profile.maxStat("kill_support", 5);
    expect(authority.catalog().find((entry) => entry.id === "armored")).toMatchObject({ knowledge: "confirmed-defeated", canPractice: true });
    expect(authority.catalog().filter((entry) => ["priest", "herald", "mender", "anchor"].includes(entry.id)).every((entry) => !entry.canPractice)).toBe(true);
    expect(authority.observe(context)).toBeUndefined(); // Constructor/hydration is not natural-install provenance.
    authority.trackSpawn(actor, context.run);
    expect(authority.observe({ ...context, blockingCinema: true })).toBeUndefined();
    expect(authority.observe({ ...context, waveActive: false })).toBeUndefined();
    Object.assign(actor, { spawnT: 0.35 }); expect(authority.observe(context)).toBeUndefined(); Object.assign(actor, { spawnT: 0 });
    const before = fixture.writes(), pending = authority.observe(context);
    expect(authority.catalog().find((entry) => entry.id === "charger")?.knowledge).toBe("save-unconfirmed");
    expect(await pending).toBe("committed"); expect(fixture.writes()).toBe(before + 1);
    expect(authority.observe(context)).toBeUndefined();
    expect(createLivePracticeEncounterPersistence(fixture.load()).catalog().find((entry) => entry.id === "charger")?.knowledge).toBe("encountered");
    const support = fixture.replay.world.entities.createEnemy("mender", 500, 700, fixture.run);
    expect(support).toMatchObject({ kind: "support", supportType: "mender" });
    Object.assign(support, { spawnT: 0 }); authority.trackSpawn(support, fixture.run);
    expect(await authority.observe({ ...context, actors: [support] })).toBe("committed");
    expect(authority.catalog().find((entry) => entry.id === "mender")?.knowledge).toBe("encountered");
    expect(authority.catalog().find((entry) => entry.id === "priest")?.knowledge).toBe("unknown");
    const ranged = fixture.replay.world.entities.createEnemy("ranged", 600, 700, fixture.run); Object.assign(ranged, { spawnT: 0 });
    authority.trackSpawn(ranged, fixture.run);
    expect(authority.observe({ ...context, actors: [ranged], ghostPractice: true })).toBeUndefined();
    expect(authority.observe({ ...context, actors: [ranged], run: { mode: "tutorial" } })).toBeUndefined();
    expect(authority.observe({ ...context, actors: [ranged], run: { mode: "playground" } })).toBeUndefined();
    expect(authority.observe({ ...context, actors: [ranged], run: { mode: "endless" } })).toBeUndefined(); // replacement run identity
    const reconstructed = fixture.replay.world.entities.createEnemy("ranged", 600, 700, fixture.run);
    expect(authority.observe({ ...context, actors: [reconstructed] })).toBeUndefined();
    expect(profile.stat("encounterEnemy:ranged")).toBe(0); expect(profile.stat("tutorialDone")).toBe(0); expect(profile.stat("coinsEarned")).toBe(0);
  });
  it("keeps failed or unavailable acknowledgements uncertain and retries only at a new genuine exposure", async () => {
    const fixture = encounterBacking(); fixture.block(true); fixture.authority.trackSpawn(fixture.actor, fixture.run);
    expect(await fixture.authority.observe(fixture.context)).toBe("unknown");
    expect(fixture.profile.stat("encounterEnemy:charger")).toBe(1);
    expect(fixture.authority.catalog().find((entry) => entry.id === "charger")?.knowledge).toBe("save-unconfirmed");
    expect(fixture.authority.observe(fixture.context)).toBeUndefined();
    fixture.block(false); expect(createLivePracticeEncounterPersistence(fixture.load()).catalog().find((entry) => entry.id === "charger")?.knowledge).toBe("unknown");
    const next = fixture.replay.world.entities.createEnemy("charger", 500, 700, fixture.run); Object.assign(next, { spawnT: 0 });
    fixture.authority.trackSpawn(next, fixture.run); expect(await fixture.authority.observe({ ...fixture.context, actors: [next] })).toBe("committed");
    expect(fixture.authority.catalog().find((entry) => entry.id === "charger")?.knowledge).toBe("encountered");
    const unavailable = createLivePracticeEncounterPersistence({ stat: () => 0, maxStat: vi.fn(), flushAcknowledged: () => Promise.resolve("unavailable") });
    unavailable.trackSpawn(next, fixture.run); expect(await unavailable.observe({ ...fixture.context, actors: [next] })).toBe("unavailable");
  });
  it("maps generic add and max operations to the profile", () => {
    const addStat = vi.fn();
    const maxStat = vi.fn();
    const persistence = createLiveProfileStatsPersistence({ addStat, maxStat });
    persistence.add("waves", 2);
    persistence.max("highestWave", 7);
    expect(addStat).toHaveBeenCalledWith("waves", 2);
    expect(maxStat).toHaveBeenCalledWith("highestWave", 7);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
