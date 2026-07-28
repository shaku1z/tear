# Tear Extreme Rendering Implementation Plan

**Status:** actionable implementation plan  
**Scope:** browser presentation architecture, visual effects, graphics settings, performance governance, captures, replay thumbnails, and validation  
**Primary objective:** make Tear look dramatically better while preserving its deterministic 120 Hz gameplay, combat readability, accessibility behavior, browser reach, and current Canvas 2D fallback.

---

## 1. Decisions

1. **Ship a WebGL2 compositor, not a WebGPU-only renderer.**
   - WebGL2 is the production GPU path.
   - Canvas 2D remains the fallback and the initial source of world pixels.
   - WebGPU stays out of the production critical path until the WebGL2 path is stable and measured.

2. **Do not migrate the game wholesale to PixiJS in the first implementation.**
   - Tear already has typed presentation snapshots and a large body of `CanvasRenderingContext2D` renderers.
   - Replacing all entity, backdrop, HUD, menu, replay, and cinematic drawing before any visible gain would create unnecessary parity risk.
   - Reconsider PixiJS only at the later direct-GPU migration checkpoint, when profiling can show whether its batching/resource management would replace enough custom infrastructure to justify the dependency.

3. **Use a staged hybrid architecture.**
   - Render the world into an offscreen Canvas 2D scene surface.
   - Upload that scene once per rendered frame to a WebGL2 compositor.
   - Draw HUD, menus, touch controls, reticle, cursor, and accessibility-critical overlays on the existing `#game` Canvas 2D surface.
   - Move high-cost primitives directly to GPU batches only after the compositor is proven.

4. **Keep gameplay independent from renderer state.**
   - The fixed-step simulation cannot consume GPU timing, render scale, frame rate, shader state, or browser capabilities.
   - Renderer adaptation changes presentation only.
   - Replays continue to record semantic actions/events and authoritative state, never frames.

5. **Extreme means richer effects, not unbounded resolution.**
   - World resolution and UI resolution are independent.
   - Every tier has an explicit pixel and render-target budget.
   - Extreme still uses dynamic scene resolution and effect degradation when needed.

6. **Protect clarity before spectacle.**
   - HUD, cursor, controller prompts, touch controls, and text are never post-processed.
   - Enemy tells, projectiles, the player silhouette, the blade, and collision-relevant effects cannot be disabled by adaptive quality.
   - Permanent chromatic aberration, full-screen motion blur, depth of field, full fluid simulation, and full-scene dynamic SDF generation are out of scope.

---

## 2. Current Tear ground truth

The implementation must start from the repository as it exists:

- The browser runtime creates one visible `#game` Canvas 2D context in `src/app/live-browser-runtime.ts`.
- `CanvasViewport` scales its backing store to browser DPR capped at `2.5`.
- The logical game view is `1600 x 900`.
- `renderPresentationFrame()` owns the stable ordering of world, reticle, menus, post layers, cursor, controller UI, and rotation gate.
- `renderLegacyWorldFrame()` already renders from mostly immutable presentation snapshots and narrow draw callbacks.
- HUD is drawn after `Backdrop.post()`, which is the correct conceptual seam for world-only post-processing.
- Graphics quality is currently `auto | high | low`, resolved to the mutable binary `GFX.low`.
- Auto quality currently guesses from CPU core count and coarse-pointer media state.
- `TearWipe`, replay thumbnails, Ghost snapshots, and some boss/training capture paths assume the visible game is one Canvas 2D element.
- `PerformanceMonitor` already records simulation, render, and frame P50/P95/max values, but has no GPU-pass timing or GPU resource gauges.
- The existing performance gate budgets desktop render P95 at 14 ms and total frame-work P95 at 16.67 ms.

### Actual authored biomes

The current stage catalogue contains:

1. The Grounds
2. The Undercroft
3. The Crimson Fields
4. The Voidspire
5. The Tear

There is no current Verdant Sanctum stage. Water reflections should not be implemented unless a separate content change adds a biome that needs them.

`src/presentation/backdrop-biomes.ts` already contains authored treatment for the five real biomes. GPU post profiles must be co-located with or derived from that presentation-owned biome definition instead of introducing a second disconnected biome registry.

---

## 3. Target architecture

```text
authoritative simulation and game state
                 |
                 v
immutable presentation snapshots
                 |
       +---------+----------------------+
       |                                |
       v                                v
offscreen Canvas 2D scene       post-FX presentation snapshot
(backdrop/world/entities)       (emissives/lights/casters/events)
       |                                |
       +---------------+----------------+
                       v
                WebGL2 compositor
     scene -> light/shadow -> bloom -> distortion -> grade
                       |
                       v
          visible world WebGL canvas (#game-world)
                       |
                       v
       visible Canvas 2D UI/input overlay (#game)
 HUD / menus / reticle / tells / touch / cursor / wipe
```

### Surface ownership

Implement a presentation-owned `RenderSurfaceHost` with these surfaces:

- **UI surface:** the existing `#game` canvas.
  - Remains the input, pointer-lock, rename positioning, and fullscreen reference element.
  - Owns menus and all unprocessed overlays.
  - Has a transparent frame during GPU-backed world screens and an opaque frame during menu-only screens.

- **World output surface:** a new `#game-world` WebGL canvas positioned directly behind `#game`.
  - `pointer-events: none`.
  - Uses `alpha: false`, `antialias: false`, `depth: false`, `stencil: false`, and `preserveDrawingBuffer: false`.
  - Is hidden or cleared when the Canvas-only backend is active.

- **Scene surface:** an offscreen Canvas 2D surface.
  - Uses the existing world renderer without changing simulation.
  - Has a backing size controlled independently from the UI surface.
  - Is uploaded once per rendered world frame in the hybrid backend.

- **Internal effect targets:** WebGL textures/framebuffers owned by a render-target pool.
  - Emissive, light, shadow, bloom, distortion, and final-color targets.
  - Half or quarter resolution unless a full-resolution target is demonstrably required.

- **Capture surface:** a reusable offscreen Canvas 2D surface allocated lazily.
  - Composes the final GPU world and Canvas UI only when a wipe, Ghost snapshot, replay thumbnail, screenshot, or export requests it.
  - Must not require `preserveDrawingBuffer: true`.

### Backend contract

Add a narrow presentation contract resembling:

```ts
export interface WorldPresentationBackend {
  readonly kind: "canvas2d" | "webgl2";
  beginFrame(layout: SurfaceLayout, clearColor: string): CanvasRenderingContext2D;
  presentWorld(frame: WorldPostFxSnapshot): void;
  uiContext(): CanvasRenderingContext2D;
  captureFrame(): HTMLCanvasElement | null;
  resize(layout: SurfaceLayout): void;
  dispose(): void;
}
```

The exact API may change during implementation, but these ownership rules may not:

- Application composition selects and owns the backend.
- World renderers receive a Canvas 2D context during the hybrid phase.
- The backend owns DOM/GPU resources.
- Gameplay never imports the backend.
- Capture users depend on a capture port, not a particular canvas.

### Proposed module layout

```text
src/presentation/rendering/
  contracts.ts
  graphics-capabilities.ts
  graphics-quality.ts
  graphics-runtime.ts
  surface-layout.ts
  render-surface-host.ts
  canvas2d-backend.ts
  frame-capture.ts
  world-post-fx-snapshot.ts
  post-fx-events.ts

  webgl2/
    webgl2-backend.ts
    compositor.ts
    render-graph.ts
    render-target-pool.ts
    resource-tracker.ts
    shader-program.ts
    gpu-timer.ts
    primitive-batch.ts

    passes/
      scene-upload-pass.ts
      emissive-pass.ts
      bloom-pass.ts
      directional-shadow-pass.ts
      local-light-pass.ts
      distortion-pass.ts
      volumetric-pass.ts
      color-grade-pass.ts
      final-pass.ts
```

Keep the module set smaller than this until each abstraction has at least two real consumers. Do not create empty framework files merely to match the diagram.

---

## 4. Presentation data contracts

### `WorldPostFxSnapshot`

Build one immutable snapshot per rendered world frame in the presentation adapter. It should contain only presentation data:

```ts
interface WorldPostFxSnapshot {
  stage: BiomePostProfile;
  camera: WorldCamera;
  viewport: WorldBounds;
  timeSeconds: number;
  reducedMotion: boolean;
  flashScale: number;
  highContrast: boolean;
  combatIntensity: number;
  emissives: readonly EmissivePrimitive[];
  lights: readonly LightPrimitive[];
  shadowCasters: readonly ShadowCaster[];
  distortions: readonly DistortionPrimitive[];
  trails: readonly TrailPrimitive[];
}
```

Use bounded arrays or reusable typed buffers. The snapshot must not retain gameplay actors or mutable renderer objects.

### Primitive categories

- **Emissive:** circle, capsule, line/ribbon, ring.
- **Light:** radial or directional, color, radius, intensity, importance, shadow policy.
- **Shadow caster:** rectangle, capsule, or segment with a stable presentation ID.
- **Distortion:** ring shockwave, slash line, radial impulse, localized noise field.
- **Trail:** timestamped centerline/edge samples with bounded history.

Do not expose arbitrary shader names from gameplay. Presentation chooses how a semantic visual fact is rendered.

### Transient post-FX events

Create a presentation-owned bounded `PostFxEventController`.

- Application coordinators feed it semantic visual events already produced by combat/wave/cinematic flows.
- It advances using the correct clock:
  - Simulation time for world events that must freeze during hit-stop/pause.
  - UI time for screen transitions and menu-safe presentation.
- It projects active events into `WorldPostFxSnapshot`.
- It replaces the GPU-relevant portion of `Backdrop._fx` gradually.
- Existing `Backdrop.flare()` and `Backdrop.bloom()` remain active in the Canvas fallback until parity is proven.

### Readability overlay

Add a post-processed-world readability step on the UI context for:

- Reticle and blade targeting indicators.
- High-contrast enemy tell outlines.
- Critical projectile outlines when high-contrast mode is enabled.
- Boss phase/timing UI.
- Floaters and HUD.

Do not move all world visuals to the UI overlay. Only move or redraw the pieces whose meaning can be damaged by color grading, bloom, fog, or distortion.

---

## 5. Graphics settings and effective quality

Replace the binary graphics model with:

```ts
type GraphicsPreference = "auto" | "low" | "standard" | "high" | "extreme";

interface GraphicsRuntimeSnapshot {
  requested: GraphicsPreference;
  effective: Exclude<GraphicsPreference, "auto">;
  backend: "canvas2d" | "webgl2";
  renderScale: number;
  fallbackReason?: string;
  degradedSteps: readonly string[];
}
```

During migration, keep `GFX.low` as a derived compatibility field:

- `true` only for the Low profile.
- `false` for Standard, High, and Extreme.
- New code consumes structured feature budgets rather than branching on `GFX.low`.
- Remove direct `GFX.low` imports from presentation modules incrementally after all current behavior has an equivalent profile flag.

### Tier contract

| Feature | Low | Standard | High | Extreme |
|---|---|---|---|---|
| Backend | Canvas 2D | Canvas 2D | WebGL2 hybrid | WebGL2 hybrid |
| Current Canvas effects | Reduced | Full | Full scene source | Full scene source |
| Scene pixel ceiling | ~1.5 MP | ~3.7 MP | ~5.0 MP | ~8.3 MP |
| Scene scale | 0.70-0.85 | 0.85-1.00 | 0.80-1.00 adaptive | 0.80-1.00 adaptive |
| Selective bloom | Off | Existing Canvas glow | 3-level | 5-level |
| Directional shadows | Off | Existing authored shadows | Half-res, one biome light | Half-res, higher-quality filter |
| Shadowed local lights | 0 | 0 | 1 | Up to 4 important lights |
| Distortion | Off | Existing Canvas effects | Localized | Localized plus biome events |
| Volumetric atmosphere | Off | Existing backdrop | Low | High |
| Temporal trails | Off | Existing blade trail | Authored weapon ribbons | Authored ribbons plus event echoes |
| Float intermediates | No | No | Optional | Preferred when supported |

The numbers are ceilings, not promises to allocate every target at that size.

### Auto policy

Auto must use capabilities and measured behavior, not pointer type.

1. Probe WebGL2 and required extensions.
2. Start conservatively:
   - Canvas Standard when WebGL2 creation fails.
   - WebGL High at a conservative render scale when WebGL2 is healthy.
3. Observe representative active gameplay rather than benchmarking only the menu.
4. Degrade after sustained budget misses.
5. Recover slowly and preferably between waves, during pauses, or in menus.
6. Never raise above the user's requested ceiling.
7. Surface the effective tier in Settings: for example `AUTO (HIGH 90%)` or `EXTREME (HIGH FALLBACK)`.

### Adaptation order

1. Reduce volumetric samples/resolution.
2. Reduce temporal trail history.
3. Reduce shadowed local-light count.
4. Reduce distortion resolution.
5. Reduce bloom pyramid depth.
6. Reduce directional-shadow filter quality.
7. Reduce scene render scale.
8. Reduce decorative particle density.

Never adapt away critical tells, projectile outlines, the player/blade silhouette, HUD resolution, or input feedback.

---

## 6. Implementation roadmap

Each numbered slice should be small enough to review and revert independently. Do not combine the surface migration, shader stack, quality migration, and final art authoring into one branch-sized change.

### Phase 0 - Baseline, visual targets, and budgets

**Purpose:** establish evidence before changing rendering.

#### Work

- [ ] Capture baseline screenshots for all five biomes at:
  - 1600 x 900 desktop.
  - 1920 x 1080 desktop.
  - 3840 x 2160 / DPR 1.
  - A DPR 2 laptop-sized viewport.
  - Ultrawide.
  - Portrait/touch rotation gate.
- [ ] Capture combat states for:
  - Idle readability.
  - Dense projectile wave.
  - Perfect parry.
  - Slam.
  - Every weapon thrown and recalled.
  - Boss introduction and phase transition.
  - Pause/draft over a live world.
  - The Tear/Source sequence.
- [ ] Record current performance diagnostics for active and constrained scenarios.
- [ ] Record current backing-store sizes and estimated Canvas memory at each responsive profile.
- [ ] Define visual references for the five visual pillars:
  - Blade-driven illumination.
  - Graphic directional shadows.
  - Localized spatial tearing.
  - Biome-authored atmosphere.
  - Combat-scaled intensity.
- [ ] Add a short evidence section to this plan with links to the captured artifacts when implementation begins.

#### Exit criteria

- Baselines are reproducible from a built test artifact.
- Current browser performance gate is green.
- No rendering work begins without a before/after capture for its target scene.

---

### Phase 1 - Structured graphics runtime

**Purpose:** replace `GFX.low` as the architectural control plane without changing appearance.

#### Work

- [ ] Add `GraphicsPreference`, `GraphicsCapabilities`, `GraphicsQualityProfile`, and `GraphicsRuntimeSnapshot`.
- [ ] Add deterministic capability/profile resolution as pure functions.
- [ ] Extend saved settings to `auto | low | standard | high | extreme`.
- [ ] Sanitize unknown and legacy values.
- [ ] Preserve existing `low`, `high`, and `auto` settings:
  - `low` remains Low.
  - Existing `high` becomes High.
  - Existing `auto` initially remains conservative until the WebGL rollout phase.
- [ ] Update the Video settings row from binary “Effects” language to graphics-tier language.
- [ ] Show the effective backend/tier and fallback reason.
- [ ] Keep `GFX.low` as a compatibility projection.
- [ ] Remove the coarse-pointer rule from final quality selection; pointer type remains an input/UI concern only.

#### Likely files

- `src/app/settings-controller.ts`
- `src/app/live-settings-rename-adapters-runtime.ts`
- `src/presentation/settings-snapshots.ts`
- `src/config/game-config.ts`
- New `src/presentation/rendering/graphics-*.ts`
- `tests/unit/settings-controller.test.ts`
- `tests/unit/settings-snapshots.test.ts`
- `tests/browser-feature-matrix.js`

#### Exit criteria

- Appearance is unchanged for existing Low and current full-quality Canvas paths.
- All settings values round-trip.
- Unknown settings recover safely.
- Unit tests cover every requested/capability/fallback combination.
- No gameplay or simulation module imports the graphics runtime.

---

### Phase 2 - Multi-surface seam and unified capture

**Purpose:** separate world and UI safely before introducing shaders.

#### Work

- [ ] Add `#game-world` behind the existing `#game` canvas.
- [ ] Keep `#game` as the sole pointer/input/fullscreen/rename anchor.
- [ ] Replace single-canvas resize ownership with `SurfaceLayout` and `RenderSurfaceHost`.
- [ ] Decouple:
  - Logical dimensions.
  - CSS dimensions.
  - UI backing size.
  - Scene backing size.
  - WebGL output size.
  - Safe-area and overscan transforms.
- [ ] Add a Canvas-only backend that preserves the exact current frame order.
- [ ] Add a hybrid placeholder backend that renders the offscreen scene and copies it without effects.
- [ ] Split `renderWorldLayers()` into explicit operations:
  - Render world scene.
  - Present/process world.
  - Render critical world overlays.
  - Render HUD and UI.
- [ ] Keep menus opaque on the UI canvas and prevent stale GPU frames from showing underneath.
- [ ] Add a `FrameCapturePort`.
- [ ] Refactor all capture consumers to use it:
  - `TearWipe`.
  - Replay/Ghost thumbnail snapshots.
  - Wave snapshots.
  - Boss-kill snapshots.
  - Training/style captures.
  - Future screenshots and social exports.
- [ ] Capture only on request; do not perform a full composite every frame.
- [ ] Add lossless test-only capture support for visual regression.

#### Likely files

- `index.html`
- `src/app/live-browser-runtime.ts`
- `src/presentation/canvas-viewport.ts`
- `src/presentation/render-pipeline.ts`
- `src/app/live-presentation-composition.ts`
- `src/app/live-game-runtime.ts`
- `src/app/live-world-presentation-adapters.ts`
- `src/presentation/tear-wipe.ts`
- `src/replay/legacy-compat.ts`
- `src/app/live-campaign-training-composition.ts`
- `src/app/live-wave-composition.ts`
- `src/app/live-combat-actions.ts`
- New surface/capture modules under `src/presentation/rendering/`

#### Tests

- Unit-test frame ordering for Canvas and hybrid backends.
- Unit-test surface layout at every responsive/DPR profile.
- Unit-test capture layer order and dimensions.
- Browser-test pointer lock, touch, fullscreen, and rename positioning.
- Browser-test pause/draft/menu transitions for stale or transparent frames.
- Browser-test Ghost/replay thumbnails and Tear wipe after a GPU-presented frame.

#### Exit criteria

- The placeholder hybrid output is visually equivalent to the current Canvas path.
- Canvas fallback remains fully playable.
- Every capture contains world and UI in the correct order.
- No blank/cleared WebGL screenshot is possible.
- Responsive, input, replay, wipe, and deterministic replay gates remain green.

---

### Phase 3 - Production WebGL2 compositor foundation

**Purpose:** establish a resilient GPU path before adding expensive effects.

#### Work

- [ ] Probe WebGL2 and extensions by capability, not browser name.
- [ ] Create the context with production-safe attributes and `preserveDrawingBuffer: false`.
- [ ] Implement:
  - Shader compilation/link diagnostics.
  - Full-screen triangle drawing.
  - Scene texture allocation and `texSubImage2D` upload.
  - Framebuffer/render-target pooling.
  - Texture/filter/wrap state ownership.
  - Resource byte estimates.
  - Resize without leaking old targets.
  - Context-loss and context-restoration handling.
  - Canvas fallback on creation, compile, allocation, or restore failure.
- [ ] Add a minimal render graph:
  - Scene upload.
  - Neutral color pass.
  - Final presentation.
- [ ] Keep RGBA8 as the guaranteed path.
- [ ] Enable float color intermediates only when supported.
- [ ] Compile shader variants during loading; poll parallel compile when available.
- [ ] Ensure render failures cannot stop the simulation or strand the current run.

#### Tests

- Pure render-graph ordering tests.
- Resource-pool allocation/reuse/disposal tests.
- Browser shader compile/link smoke.
- Synthetic context-loss and restoration journey.
- WebGL-unavailable fallback journey.
- Repeated resize/fullscreen cycles with stable resource counts.

#### Exit criteria

- Neutral WebGL output matches the hybrid source closely enough that no gameplay information changes.
- Context loss falls back without a simulation reset.
- Context restoration rebuilds all owned resources.
- No per-frame render-target allocation occurs after warm-up.
- The compositor reports backend, capabilities, target count, and estimated GPU bytes to diagnostics.

---

### Phase 4 - First dramatic visual package

**Purpose:** deliver the largest visual improvement before advanced lighting.

#### 4A. Authored emissive data

- [ ] Build `WorldPostFxSnapshot` in the live presentation adapter.
- [ ] Add authored emissives for:
  - Blade edge/tip.
  - Weapon trails.
  - Perfect parries.
  - Projectiles with luminous identity.
  - Enemy/boss cores.
  - Stage rifts and luminous accents.
- [ ] Do not derive emission only from scene brightness.
- [ ] Keep primitive counts bounded and importance-ranked.

#### 4B. Selective multi-scale bloom

- [ ] Render emissives to a half-resolution target.
- [ ] Build a 1/2, 1/4, 1/8 pyramid for High.
- [ ] Add 1/16 and wider spread for Extreme when budget allows.
- [ ] Use low-sample down/up filtering rather than full-resolution Gaussian blur.
- [ ] Provide tight and wide bloom components.
- [ ] Scale transient bloom by flash accessibility settings.
- [ ] Do not bloom UI or high-contrast outlines.

#### 4C. Weapon-authored trails

- [ ] Maintain bounded presentation-only history for blade geometry.
- [ ] Render geometry ribbons rather than full-screen motion blur.
- [ ] Give each weapon a readable identity:
  - Sword: narrow, crisp cyan ribbon.
  - Hammer: broad segmented wake with a strong terminal impact.
  - Spear: long needle streak with restrained width.
  - Chainblade: energy pulses along the tether/chain path.
  - Ringblade: circular arc and recall echoes.
- [ ] Disable or shorten history under reduced motion.

#### 4D. Localized distortion

- [ ] Add a low-resolution vector distortion buffer.
- [ ] Author distortion for:
  - Perfect parry shockwave.
  - Slam ground compression.
  - Dash wake.
  - Boss death/phase transition.
  - Voidspire spatial slices.
  - The Tear rifts.
- [ ] Keep enemy telegraphs and HUD outside distortion.
- [ ] Use chromatic separation only as a short event treatment in Voidspire/The Tear.

#### 4E. Color grade

- [ ] Add exposure, contrast, saturation, shadow tint, highlight tint, vignette, and grain controls.
- [ ] Move `Backdrop.post()` vignette/grain to GPU only after Canvas/GPU parity is captured.
- [ ] Keep a neutral profile for unsupported/unknown stages.

#### Exit criteria

- Blade movement is the visual focal point in every biome.
- Bloom responds to authored emission, not pale backgrounds.
- Dense combat remains readable in normal and high-contrast modes.
- Reduced motion and flash controls visibly constrain the new effects.
- High stays inside the existing total frame budget on the reference profile.
- Low and Standard Canvas paths remain visually and behaviorally stable.

---

### Phase 5 - Graphic shadows and local lighting

**Purpose:** add depth in a way that fits Tear’s geometric art.

#### 5A. Contact shadows

- [ ] Add soft analytic contact shadows for player, enemies, bosses, blade-near-surface, and major debris.
- [ ] Scale/fade by height above the receiving surface.
- [ ] Widen briefly on landing/impact.
- [ ] Render at half resolution.

#### 5B. Directional platform/entity shadows

- [ ] Project rectangle/segment silhouettes opposite the biome’s primary light vector.
- [ ] Include platforms, temporary walls, player, enemies, and large boss geometry.
- [ ] Cull casters outside the painted world bounds.
- [ ] Blur/soften at half resolution.
- [ ] Use one authored directional light per biome before considering multiple directions.

#### 5C. Important local lights

- [ ] Introduce light importance classes:
  - Decorative: radial glow only.
  - Gameplay: radial light with optional occlusion.
  - Hero: shadow-capable light.
- [ ] Use visibility polygons for the small number of important local lights.
- [ ] Build/query a presentation-owned spatial index of platform/wall edges.
- [ ] Cap shadowed local lights at 1 on High and 4 on Extreme.
- [ ] Rank lights deterministically from presentation data; never allow array order to cause visible flicker.

#### 5D. Readability

- [ ] Clamp darkness around the player and critical projectiles.
- [ ] Redraw high-contrast outlines after the light/shadow composite.
- [ ] Ensure a shadow cannot hide a damage tell.

#### Exit criteria

- Platforms and actors read as grounded instead of flat.
- Shadow direction is coherent within each biome.
- Additional projectiles do not create unbounded shadow work.
- Light selection is stable from frame to frame.
- High/Extreme light counts and shadow target sizes are visible in diagnostics.

---

### Phase 6 - Author the five real biomes

**Purpose:** make the renderer feel designed for Tear rather than like a generic shader stack.

Co-locate GPU post profiles with the existing `BIOME_ART` definitions.

| Biome | Primary treatment | Signature event |
|---|---|---|
| The Grounds | Warm upper light, long orderly shadows, restrained dust shafts, clean warm grade | Broad white/cyan parry light cutting across disciplined silhouettes |
| The Undercroft | Cool ambient base, localized furnace orange, vertical industrial shadows, low haze | Machinery/furnace pulse during Colossus attacks |
| The Crimson Fields | Low lateral sun, red/gold grade, ash, localized horizon heat shimmer | Wide hot impact bloom and crown/fire events |
| The Voidspire | Violet/cold grade, sharp rims, sparse echo trails, unstable but localized shadow behavior | Spatial slice/refraction and short event-only color separation |
| The Tear | Minimal ambient fill, cyan emissive dominance, deep silhouette control, rift distortion | Reality split, exposure pulse, and blade-lit Source geometry |

#### Work

- [ ] Add a `BiomePostProfile` to the presentation-owned biome definition.
- [ ] Migrate existing vignette/grain and reactive flare intent without discarding current authored backgrounds.
- [ ] Add reduced-motion variants for every continuous biome animation.
- [ ] Add high-contrast clamps for dark or saturated profiles.
- [ ] Author boss-specific overrides as temporary presentation profiles, not permanent global settings.
- [ ] Capture a visual regression set for all five biomes and their bosses.

#### Exit criteria

- Each biome is recognizable from lighting/grade alone.
- Effects reinforce the existing palette and silhouette art.
- No biome relies on a feature unavailable to the High tier.
- The Tear is the strongest treatment, but its cyan effects do not erase player/blade/projectile separation.

---

### Phase 7 - Adaptive performance governance

**Purpose:** make the enhanced renderer safe across real browsers and devices.

#### Work

- [ ] Extend `PerformanceMonitor` with optional categories:
  - Scene upload.
  - Shadow.
  - Light.
  - Bloom.
  - Distortion.
  - Volumetric.
  - Final composite.
- [ ] Use `EXT_disjoint_timer_query_webgl2` asynchronously when available.
- [ ] Fall back to CPU frame/render timing when GPU queries are unavailable or disjoint.
- [ ] Add gauges:
  - Backend.
  - Effective tier.
  - Scene width/height/scale/pixels.
  - Shadowed light count.
  - Active post-FX primitive counts.
  - Render-target count.
  - Estimated GPU bytes.
  - Context loss/restoration count.
  - Quality degradation step.
- [ ] Add hysteresis:
  - Degrade only after sustained misses.
  - Recover only after several seconds of headroom.
  - Avoid upgrading during dense combat.
- [ ] Add explicit pixel budgets to `CanvasViewport`/`SurfaceLayout`.
- [ ] Prevent shader compilation, large target allocation, and tier upgrades during a combat-critical frame.

#### Initial performance targets

- Low and Standard preserve the current performance budgets.
- High:
  - Total frame-work P95 remains at or below 16.67 ms on the reference desktop profile.
  - GPU effects target is approximately 3 ms where hardware GPU timing is credible.
  - Scene upload P95 target is 2 ms or less.
- Extreme:
  - GPU effects target is approximately 6 ms on an explicitly documented Extreme-capable profile.
  - It must reduce resolution/effects rather than exceed the sustained frame target.
- No new >50 ms frames in the canonical performance scenario.
- No unbounded JS heap or GPU-resource growth over repeated runs/resizes.

CI software rendering and headless GPU behavior must not be treated as a universal hardware benchmark. Record the renderer/capability profile alongside every performance artifact.

#### Exit criteria

- Auto selection reacts to measured performance and capabilities.
- Degradation never changes simulation or replay hashes.
- Effective-tier changes are stable rather than oscillating.
- A constrained browser scenario visibly degrades and remains playable.
- Settings accurately report the requested and effective result.

---

### Phase 8 - Direct GPU migration checkpoint

**Purpose:** remove the hybrid upload bottleneck only where profiling justifies it.

#### Decision gate

Measure:

- Scene Canvas render time.
- Canvas-to-texture upload time.
- Particle draw cost.
- Blade/trail draw cost.
- Repeated entity primitive cost.
- GPU compositor cost.

Do not begin a general scene rewrite unless the hybrid path is the demonstrated bottleneck.

#### Migration order

1. Visual-only particles.
2. Weapon trails and rings.
3. Distortion/emissive primitives.
4. Repeated analytic circles/rectangles.
5. Platforms and shadow masks.
6. Projectiles/enemy silhouettes only if still needed.

Simulation can remain CPU-side. Upload compact immutable instance data and render in batches.

#### PixiJS checkpoint

Re-evaluate PixiJS only here:

- Choose PixiJS if Tear now needs a retained scene graph, texture atlases, rich text/sprites, and broad batching/resource management.
- Keep the custom path if the scene remains mostly analytic primitives and the compositor already owns the necessary infrastructure.
- Do not run two competing GPU resource managers.

#### Exit criteria

- Every direct-GPU migration has before/after profiling.
- Canvas fallback retains a credible visual representation.
- No gameplay actor owns GPU objects.
- Visual parity or intentional improvement is captured before deleting the prior renderer.

---

### Phase 9 - Rollout, cleanup, and production default

#### Rollout order

1. Canvas fallback and structured tiers ship with no default change.
2. High WebGL becomes user-selectable.
3. Extreme becomes opt-in on capable browsers.
4. Auto begins selecting High only after browser/performance soak evidence.
5. Remove duplicated Canvas post effects only after High/Extreme and capture paths are stable.

#### Work

- [ ] Add a test-build-only backend override for browser matrices.
- [ ] Do not add a writable production debug global.
- [ ] Update bundle budgets for shaders and renderer code.
- [ ] Update `docs/FEATURE_INVENTORY.md` with credible evidence for:
  - Multi-surface responsive presentation.
  - Graphics tiers/fallback.
  - Context loss/restoration.
  - Unified capture/replay thumbnails.
  - Accessibility behavior.
  - Performance governance.
- [ ] Document renderer capability/fallback behavior in `docs/ARCHITECTURE.md`.
- [ ] Remove compatibility `GFX.low` only when all consumers use structured profiles.
- [ ] Keep WebGPU, fluids, full-scene SDF, and experimental reflection work in a separate R&D document if pursued later.

#### Exit criteria

- Auto can safely choose the GPU backend in production.
- Standalone, PWA, and CrazyGames artifacts behave consistently.
- Low/Standard remain supported.
- No capture, replay, pointer, responsive, accessibility, or deterministic gameplay regression remains.

---

## 7. Required test and evidence matrix

### Deterministic and gameplay safety

- Existing unit and conformance suites remain green.
- Authoritative replay verification remains identical at 30/60/144 Hz.
- Blade lifecycle, locomotion, enemy charge, combat resolution, ranged cycle, projectile parry, and Mirror parity gates remain green.
- Renderer tier changes do not alter gameplay effect counts that feed authoritative outcomes.

### Presentation unit tests

- Render graph ordering.
- Quality profile resolution and hysteresis.
- Surface layout/pixel budgeting.
- Post-FX event expiry and clock ownership.
- Bounded primitive histories.
- Light importance/ranking stability.
- Capture layer order.
- Resource pool reuse and disposal.
- Context-loss state transitions.

### Built-browser tests

- WebGL2 success.
- WebGL2 unavailable fallback.
- Shader/target allocation failure fallback.
- Context loss/restoration during active gameplay.
- Fullscreen and repeated resize.
- Desktop, touch, controller, and pointer lock.
- Pause/draft/menu over GPU world.
- Wipe, Ghost capture, replay thumbnail, and replay viewer.
- Reduced motion, zero flash, and high contrast.
- Standalone and CrazyGames.

### Visual regression scenes

- All five biomes idle and in dense combat.
- All five weapons held/thrown/recalled.
- Perfect parry, slam, dash, boss intro, boss phase, boss death.
- HUD at low health and high style.
- High-contrast mode.
- Reduced-motion mode.
- Low, Standard, High, Extreme, and forced fallback.
- DPR/responsive profiles from Phase 0.

### Performance evidence

- Active desktop gameplay.
- Constrained gameplay.
- Five repeated run/reset cycles.
- Repeated fullscreen/resize cycles.
- Scene-upload stress.
- Dense projectiles/particles.
- Four shadowed-light Extreme stress case.
- GPU resource count and estimated bytes return to baseline after run disposal.

---

## 8. Repository gates by change type

Run the smallest relevant checks during each slice, then the canonical release gate before production rollout.

### Settings/contracts

```text
pnpm exec vitest run tests/unit/settings-controller.test.ts tests/unit/settings-snapshots.test.ts
pnpm typecheck
pnpm lint
```

### Presentation/frame/capture

```text
pnpm exec vitest run tests/unit/presentation-runtime-boundaries.test.ts tests/unit/world-renderers.test.ts tests/unit/tear-wipe.test.ts tests/unit/replay-visual.test.ts
pnpm typecheck
pnpm lint
pnpm build:test:standalone
pnpm test:browser:responsive
pnpm test:browser:features
```

### Performance/backend

```text
pnpm build:test:standalone
pnpm test:browser:performance
pnpm test:browser:production-isolation
pnpm check:bundles
```

### Gameplay safety

```text
pnpm test:parity:unit
pnpm test:browser:blade-lifecycle
pnpm test:browser:player-locomotion
pnpm test:browser:enemy-charge
pnpm test:browser:combat-resolution
pnpm test:browser:ranged-cycle
pnpm test:browser:projectile-parry
pnpm test:browser:mirror-pursuit
```

Before production default selection:

```text
pnpm check
```

Use TearBench autonomous playtesting for visual/gameplay evidence after each material visual phase, and use the Tear change gate to select the canonical targeted checks for the exact changed files.

---

## 9. Risk register and stop conditions

### Full-frame Canvas upload stalls

**Signal:** scene upload exceeds 2 ms P95 on the High reference profile or causes long frames.

**Response:**

1. Lower scene pixel budget.
2. Avoid uploading unchanged menu/paused frames when safe.
3. Confirm no implicit readback or format conversion.
4. Move the measured expensive primitive groups directly to GPU.
5. Revisit the direct-GPU/PixiJS checkpoint earlier if upload remains the limiting factor.

### GPU memory growth

**Signal:** target count or estimated bytes rise across resize/run cycles.

**Response:**

- Enforce target-pool ownership.
- Limit full-resolution color targets.
- Keep bloom/shadow/distortion/volumetric targets reduced.
- Dispose replaced sizes after a successful resize.
- Reduce the scene pixel ceiling before removing effects.

### Capture regressions

**Signal:** blank, flipped, stale, missing-UI, or tainted captures.

**Response:**

- Treat unified capture as a Phase 2 blocker.
- Never enable persistent drawing-buffer preservation as a shortcut.
- Keep Canvas fallback capture available.

### Accessibility/readability regressions

**Signal:** tells disappear under bloom/fog/shadow, reduced motion still produces continuous warping, or zero-flash still flashes.

**Response:**

- Disable the offending pass for the accessibility profile.
- Move/redraw critical visuals after post-processing.
- Block rollout until high-contrast and accessibility visual evidence passes.

### Renderer affects determinism

**Signal:** replay hashes, fixed-tick parity, actor counts, or authoritative outcomes differ by tier.

**Response:**

- Stop the phase.
- Remove renderer state from the gameplay path.
- Ensure quality affects only presentation projections and visual-only budgets.

### Generic “shader demo” look

**Signal:** every biome uses the same bloom/distortion treatment or effects obscure Tear’s geometric silhouettes.

**Response:**

- Reduce global effect intensity.
- Author within the five biome profiles.
- Require before/after review against the visual pillars and combat readability scenes.

---

## 10. Definition of done

The rendering initiative is complete only when:

- WebGL2 High/Extreme materially improve the five real biomes and all five weapons.
- The blade visibly illuminates and tears the world without obscuring combat.
- Low and Standard Canvas paths remain supported and performant.
- Auto quality is capability- and measurement-driven.
- Extreme is bounded by pixels, pass cost, memory, and adaptive governance.
- Context loss, missing extensions, shader failures, and constrained devices retain a playable path.
- HUD/input/accessibility-critical layers remain crisp and unprocessed.
- Wipes, screenshots, Ghost snapshots, replay thumbnails, and replay viewing compose the correct final frame.
- Deterministic gameplay and replay evidence remain unchanged.
- Standalone, PWA, and CrazyGames gates pass.
- `docs/ARCHITECTURE.md` and `docs/FEATURE_INVENTORY.md` record the new contracts and evidence.

The recommended first implementation slice is **Phase 0 followed by Phase 1**, then the **Phase 2 multi-surface/capture seam**. Do not start bloom or shadows until that seam is proven.
