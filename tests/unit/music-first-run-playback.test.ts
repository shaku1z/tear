import { describe, expect, it, vi } from "vitest";
import type { ProgressSource } from "../../src/domain/progress-facts";
import { parseMusicCatalog } from "../../src/audio/music/catalog";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { BiomeStemBackend } from "../../src/audio/stems/biome-stem-backend";
import { dropWarmedStems } from "../../src/audio/stems/web-audio-backend";
import {
  INTRO_SECONDS,
  cueRequested,
  index,
  musicBackend,
  requested,
  settle,
  shippedCues,
  snapshot,
  useMusicBrowserStubs,
} from "./music-backend-harness";

const VERDANT = "The Verdant Sanctum";
useMusicBrowserStubs();

const backendFor = (progress: ProgressSource | undefined) => musicBackend(progress ? { progress } : {});

async function enterVerdant(progress: ProgressSource | undefined) {
  const run = await backendFor(progress);
  run.backend.updateContext(snapshot(VERDANT, "combat"));
  await vi.waitFor(() => {
    expect(cueRequested("spring") || cueRequested("once-at-a-time")).toBe(true);
  });
  await settle();
  return run;
}

describe("the Verdant Sanctum's music follows saved progress", () => {
  it("plays Spring on the first Verdant run: the opening intro once, then the loop", async () => {
    const { backend, context } = await enterVerdant({ stats: { _biomes: { "The Grounds": 1 } }, ach: {} });
    expect(cueRequested("spring")).toBe(true);
    const intros = () => context.sources.filter((s) => s.buffer?.url.endsWith("spring/opus/intro.ogg"));
    await vi.waitFor(() => {
      expect(intros()).toHaveLength(1);
    });
    const introAt = intros()[0]?.starts[0] ?? Number.NaN;
    const loopStarts = context.sources
      .filter((s) => s.buffer?.url.includes("/spring/opus/") && !s.buffer.url.endsWith("intro.ogg"))
      .flatMap((s) => s.starts);
    expect(loopStarts.length).toBeGreaterThan(0);
    for (const at of loopStarts) expect(at).toBeGreaterThanOrEqual(introAt + INTRO_SECONDS - 0.001);

    // After the boss, Spring comes back without its intro.
    backend.updateContext(snapshot(VERDANT, "boss", "rootbound"));
    await vi.waitFor(() => {
      expect(cueRequested("nocturnal-urgency")).toBe(true);
    });
    await settle();
    backend.updateContext(snapshot(VERDANT, "combat"));
    await settle();
    await settle();
    expect(intros()).toHaveLength(1);
  });

  it("plays Once At A Time when the save has already reached the Verdant Sanctum", async () => {
    await enterVerdant({ stats: { _biomes: { "The Grounds": 1, [VERDANT]: 1 }, killRootbound: 1 }, ach: {} });
    expect(cueRequested("once-at-a-time")).toBe(true);
    expect(cueRequested("spring")).toBe(false);
  });

  it("plays Once At A Time without saved progress: seed races, practice and replays", async () => {
    await enterVerdant(undefined);
    expect(cueRequested("once-at-a-time")).toBe(true);
    expect(cueRequested("spring")).toBe(false);
  });
});

describe("warming the menu cue", () => {
  it("fetches its first layer before music starts, and nothing once music has started", async () => {
    const early = new BiomeStemBackend(
      shippedCues(),
      validateMusicRoutingManifest(index.routing),
      parseMusicCatalog(index.catalog),
    );
    early.warmFirstLayer(early.menuCueId);
    expect(cueRequested(early.menuCueId)).toBe(true);
    dropWarmedStems();

    // The first input came before the warm-up: the cue is already fetching its own stems.
    const { backend } = await backendFor(undefined);
    await settle();
    requested.length = 0;
    backend.warmFirstLayer(backend.menuCueId);
    expect(requested).toEqual([]);
  });
});
