const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const { withJourney } = require("./browser-journey-harness");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(
  root,
  "artifacts",
  "tearbench",
  "checkpoints",
  "scene-direction",
  "A2",
  "experiments",
  "01",
  "captures",
);
const phase = process.env.TEAR_SCENE_DIRECTION_A2_PHASE || "candidate";
const imageNative = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE === "1";
const imageNativeControl = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_CONTROL === "1";
const imageNativeLiving = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_LIVING === "1";
const livingRenderProbe = process.env.TEAR_SCENE_DIRECTION_LIVING_RENDER_PROBE === "1";
assert.ok(!livingRenderProbe || imageNativeLiving, "Living render probe requires the living prototype");
assert.ok(
  !imageNativeLiving || (imageNative && !imageNativeControl),
  "Living prototype requires independent image-native mode",
);
const imageNativeCoverage = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_COVERAGE === "1";
const imageNativeCameraSweep = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_CAMERA_SWEEP === "1";
const imageNativeMotion = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_MOTION === "1";
const imageNativeAccessibility = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_ACCESSIBILITY === "1";
const imageNativeResponses = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_RESPONSES === "1";
const imageNativeBoss = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_BOSS === "1";
const bossCanopyOnly = process.env.TEAR_SCENE_DIRECTION_BOSS_CANOPY_ONLY === "1";
assert.ok(!bossCanopyOnly || imageNativeBoss, "Canopy coverage requires boss mode");
const bossLatePhases = process.env.TEAR_SCENE_DIRECTION_BOSS_LATE_PHASES === "1";
assert.ok(!bossLatePhases || (imageNativeBoss && !bossCanopyOnly), "Late phases require independent boss mode");
const bossRecovery = process.env.TEAR_SCENE_DIRECTION_BOSS_RECOVERY === "1";
assert.ok(
  !bossRecovery || (imageNativeBoss && !bossCanopyOnly && !bossLatePhases),
  "Recovery requires independent boss mode",
);
const bossResponseVideo = process.env.TEAR_SCENE_DIRECTION_BOSS_RESPONSE_VIDEO === "1";
assert.ok(
  !bossResponseVideo || (imageNativeBoss && !bossCanopyOnly && !bossLatePhases && !bossRecovery),
  "Response video requires independent boss mode",
);
const imageNativePlatformStates = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_PLATFORM_STATES === "1";
const imageNativePlatformLifecycle = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_PLATFORM_LIFECYCLE === "1";
const platformApplication = process.env.TEAR_SCENE_DIRECTION_PLATFORM_APPLICATION === "1";
const platformVideo = process.env.TEAR_SCENE_DIRECTION_PLATFORM_VIDEO === "1";
assert.ok(!platformApplication || imageNativePlatformLifecycle, "Application platform capture requires lifecycle mode");
assert.ok(!platformVideo || platformApplication, "Platform video requires the full application-frame path");
const imageNativeCombat = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_COMBAT === "1";
const imageNativeCombatVideo = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_COMBAT_VIDEO === "1";
const combatProfile = process.env.TEAR_SCENE_DIRECTION_COMBAT_PROFILE || "default";
const combatBaselinePhase = process.env.TEAR_SCENE_DIRECTION_COMBAT_BASELINE_PHASE;
const bossBaselinePhase = process.env.TEAR_SCENE_DIRECTION_BOSS_BASELINE_PHASE;
const responseProfile = process.env.TEAR_SCENE_DIRECTION_RESPONSE_PROFILE;
const responseFrozenControl = process.env.TEAR_SCENE_DIRECTION_RESPONSE_FROZEN_CONTROL === "1";
const responseImmediateRestore = process.env.TEAR_SCENE_DIRECTION_RESPONSE_IMMEDIATE_RESTORE === "1";
const responseSequence = process.env.TEAR_SCENE_DIRECTION_RESPONSE_SEQUENCE || "full";
const responseDrawTrace = process.env.TEAR_SCENE_DIRECTION_RESPONSE_DRAW_TRACE === "1";
assert.ok(!responseDrawTrace || imageNativeResponses, "Draw tracing is a response diagnostic only");
assert.ok(["full", "damage-only", "rollback-only"].includes(responseSequence), "Unknown response sequence");
assert.ok(
  responseSequence === "full" || (!responseFrozenControl && !responseImmediateRestore),
  "Keep sequence controls independent",
);
assert.ok(
  !responseImmediateRestore || !responseFrozenControl,
  "Keep immediate restore separate from frozen rendering history",
);
assert.ok(
  responseProfile === undefined || ["default", "low-only", "combined"].includes(responseProfile),
  "Unknown response profile",
);
const imageNativeExtendedCoverage = process.env.TEAR_SCENE_DIRECTION_IMAGE_NATIVE_EXTENDED_COVERAGE === "1";
const deviceScaleFactor = Number(process.env.TEAR_SCENE_DIRECTION_DPR || "1");
assert.ok([1, 2, 3].includes(deviceScaleFactor), "Use a repository DPR profile");
assert.match(phase, /^(candidate|verification-[a-z0-9-]+)$/u, "A2-01 phase must be candidate or verification-<label>");
const phaseDirectory = path.join(outputRoot, phase);
assert.ok(!fs.existsSync(phaseDirectory), "Scene evidence phase already exists; preserve it and choose a fresh phase");
assert.equal(imageNative, true, "This bounded harness requires explicit image-native mode");
assert.ok(
  [
    imageNativeMotion,
    imageNativeAccessibility,
    imageNativeResponses,
    imageNativeBoss,
    imageNativePlatformStates,
    imageNativePlatformLifecycle,
    imageNativeCombat,
    imageNativeCoverage,
  ].filter(Boolean).length <= 1,
  "Select exactly one primary scene capture mode",
);
assert.ok(!imageNativeCameraSweep || imageNativeCoverage, "Camera sweep requires coverage mode");
assert.ok(!imageNativeCombatVideo || imageNativeCombat, "Combat video requires combat mode");
assert.ok(
  !livingRenderProbe ||
    ![
      imageNativeMotion,
      imageNativeAccessibility,
      imageNativeResponses,
      imageNativeBoss,
      imageNativePlatformStates,
      imageNativePlatformLifecycle,
      imageNativeCombat,
      imageNativeCoverage,
    ].some(Boolean),
  "Keep cost probe independent from capture modes",
);
fs.mkdirSync(phaseDirectory, { recursive: true });

const cleanPlayable = Object.freeze({ ui: "include", debug: "exclude", pointerLock: "exclude", actors: "include" });
const cleanEnvironment = Object.freeze({ ui: "exclude", debug: "exclude", pointerLock: "exclude", actors: "exclude" });

const verdantResolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl",
    schemaVersion: 1,
    id: "scene-direction-a2-verdant-wave-31",
    stateClass: "reconstructed-reachable",
    seed: "scene-direction-a1-verdant",
    start: Object.freeze({
      mode: "campaign",
      difficulty: "normal",
      weapon: "sword",
      stage: "verdant-sanctum",
      wave: 31,
    }),
    constraints: Object.freeze({ legalProgression: true }),
    tags: Object.freeze(["scene-direction", "a2", "verdant-sanctum"]),
    maxTicks: 1_440,
  }),
  scenario: Object.freeze({
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id: "scene-direction-a2-verdant-wave-31",
    version: 1,
    description: "A2 Verdant production-slice capture coordinate",
    stateClass: "reconstructed-reachable",
    executionClass: "engineering",
    seed: "scene-direction-a1-verdant",
    start: Object.freeze({
      mode: "campaign",
      difficulty: "normal",
      weapon: "sword",
      stage: "verdant-sanctum",
      wave: 31,
    }),
    maxTicks: 1_440,
    assertions: Object.freeze([
      "runtime.finite-state",
      "entity.unique-id",
      "player.valid-health",
      "world.legal-bounds",
    ]),
    tags: Object.freeze(["scene-direction", "a2", "verdant-sanctum"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }),
  reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }),
  resolvedHash: "scene-direction-a2-verdant-wave-31",
});

function pngBuffer(dataUrl) {
  assert.match(dataUrl, /^data:image\/png;base64,/u);
  return Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertPNGEqual(actual, expected, message = "PNG bytes must match exactly") {
  assert.ok(pngBuffer(actual).equals(pngBuffer(expected)), message);
}

async function recordCombatVideo(page, filename = "tearbench-wave-attempt.mp4") {
  const executable = process.env.TEAR_FFMPEG_EXE;
  assert.ok(executable && fs.existsSync(executable), "Combat recording requires an explicit existing TEAR_FFMPEG_EXE");
  const output = path.join(phaseDirectory, filename);
  const encoder = spawn(
    executable,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-f",
      "image2pipe",
      "-framerate",
      "30",
      "-vcodec",
      "png",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      output,
    ],
    { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
  );
  let error = null,
    stderr = "",
    frameCount = 0;
  encoder.on("error", (value) => {
    error = value;
  });
  encoder.stdin.on("error", (value) => {
    error = value;
  });
  encoder.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4000);
  });
  const finished = new Promise((resolve) => encoder.on("close", resolve));
  await page.exposeFunction("__writeTearCombatFrame", async (dataUrl) => {
    if (error) throw error;
    await new Promise((resolve, reject) =>
      encoder.stdin.write(pngBuffer(dataUrl), (value) => (value ? reject(value) : resolve())),
    );
    frameCount += 1;
  });
  return async () => {
    encoder.stdin.end();
    const code = await finished;
    if (error) throw error;
    assert.equal(code, 0, stderr || "FFmpeg recording failed");
    return {
      file: path.basename(output),
      fps: 30,
      frameCount,
      durationSeconds: frameCount / 30,
      audio: false,
      timing: "One captured production render per 1/30-second application step; final view held for two seconds",
    };
  };
}

withJourney(
  {
    name: `scene direction A2 ${phase} evidence`,
    port: 8392,
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor,
    browserCloseTimeoutMs: 5_000,
    ...(imageNative
      ? { query: { sceneNative: imageNativeControl ? "control" : imageNativeLiving ? "living" : "1" } }
      : {}),
  },
  async ({ page, buildInfo }) => {
    const captures = [];

    async function materializeVerdant() {
      return page.evaluate((resolved) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        const launched = environment.forgeResolvedScenario(resolved);
        if (!launched.ok) throw new Error(`Verdant A2 State Forge launch failed: ${JSON.stringify(launched)}`);
        for (let index = 0; index < 12; index += 1) environment.renderFrame(1 / 60);
        window.__A2_CAPTURE_ENV__ = environment;
        return launched;
      }, verdantResolved);
    }

    async function capture(label, policy, detail = {}) {
      const result = await page.evaluate(
        ({ capturePolicy, trace }) => {
          const environment = window.__A2_CAPTURE_ENV__;
          if (!environment) throw new Error("A2 capture environment is unavailable");
          const observation = environment.observe();
          const environmentState = environment.environment().snapshot();
          const snapshot = environment.captureSnapshot(
            `scene-direction-a2-${observation.tick}`,
            "reconstructed-reachable",
          );
          const context = document.getElementById("game").getContext("2d");
          const ownFillRect = Object.getOwnPropertyDescriptor(context, "fillRect");
          const nativeFillRect = context.fillRect;
          const drawTrace = [];
          if (trace)
            context.fillRect = function (...args) {
              if (this.shadowBlur > 0) {
                const transform = this.getTransform();
                drawTrace.push({
                  args,
                  fillStyle: String(this.fillStyle),
                  globalAlpha: this.globalAlpha,
                  composite: this.globalCompositeOperation,
                  filter: this.filter,
                  shadowBlur: this.shadowBlur,
                  shadowColor: this.shadowColor,
                  shadowOffsetX: this.shadowOffsetX,
                  shadowOffsetY: this.shadowOffsetY,
                  smoothing: this.imageSmoothingEnabled,
                  smoothingQuality: this.imageSmoothingQuality,
                  transform: [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
                });
              }
              return Reflect.apply(nativeFillRect, this, args);
            };
          let image;
          try {
            image = environment.screenshot(capturePolicy);
          } finally {
            if (trace) {
              if (ownFillRect) Object.defineProperty(context, "fillRect", ownFillRect);
              else delete context.fillRect;
            }
          }
          return {
            image,
            drawTrace: trace ? drawTrace : undefined,
            presentation: environment.presentation(),
            observation,
            environmentState,
            exactHash: snapshot.hashes.exact,
            semanticHash: snapshot.hashes.semantic,
            platforms: snapshot.state["tear.platform.v1"],
            bladeState: snapshot.state["tear.blade.v1"],
          };
        },
        { capturePolicy: policy, trace: responseDrawTrace },
      );
      const image = pngBuffer(result.image);
      const file = `${label}.png`;
      fs.writeFileSync(path.join(phaseDirectory, file), image);
      captures.push({
        label,
        file: `${phase}/${file}`,
        sha256: sha256(image),
        policy,
        detail,
        stage: result.observation.run.stage,
        mode: result.observation.run.mode,
        seed: verdantResolved.scenario.seed,
        simulationTick: result.observation.tick,
        presentationClockSeconds: result.presentation.presentationClockSeconds,
        exactHash: result.exactHash,
        semanticHash: result.semanticHash,
        platformCount: result.platforms.length,
        platforms: result.platforms,
        playerState: result.observation.player,
        bladeState: result.bladeState,
        presentation: result.presentation,
        environmentHash: sha256(Buffer.from(JSON.stringify(result.environmentState))),
        environmentFields: result.environmentState.fields,
        environmentKinds: result.environmentState.fields.map((entry) => entry.kind),
        combatObjectKinds: result.environmentState.combatObjects.map((entry) => entry.kind),
        routeKinds: result.environmentState.routes.map((entry) => entry.kind),
      });
      return result;
    }

    await materializeVerdant();
    if (imageNative) {
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.status() === "ready");
      if (!imageNativeControl)
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("neutral"));
      const resourceReport = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.report());
      assert.equal(resourceReport.fallbackActive, false, "Fallback cannot certify image-native appearance");
      assert.equal(resourceReport.decodedResources, imageNativeControl ? 2 : 9);
      assert.equal(
        resourceReport.packageId,
        imageNativeControl
          ? "verdant-IN1-control"
          : imageNativeLiving
            ? "verdant-living-stage-prototype"
            : "verdant-IN3-overscan",
      );
      if (imageNativeLiving) assert.equal(resourceReport.decodedBytes, 12359040);
      if (
        imageNativeLiving &&
        !imageNativeAccessibility &&
        !imageNativeCombat &&
        !imageNativeCoverage &&
        !imageNativeResponses &&
        !imageNativeBoss &&
        !imageNativePlatformStates &&
        !imageNativePlatformLifecycle
      ) {
        assert.equal(resourceReport.decodedBytes, 12359040);
        await capture("living-playable", cleanPlayable);
        const neutral = await capture("living-composite", cleanEnvironment);
        for (const view of ["support-only", "foliage-only"]) {
          await page.evaluate((value) => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setView(value), view);
          const isolated = await capture(`living-${view}`, cleanEnvironment, { view });
          assert.equal(isolated.exactHash, neutral.exactHash, "Layer isolation cannot mutate gameplay");
          assert.ok(
            !pngBuffer(isolated.image).equals(pngBuffer(neutral.image)),
            "Layer isolation must visibly change the composite",
          );
        }
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setView("composite"));
        const restored = await capture("living-restored", cleanEnvironment);
        assertPNGEqual(restored.image, neutral.image, "Composite restoration must reproduce exact pixels");
        assert.deepEqual(
          await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.report()),
          resourceReport,
        );
        let video = null,
          motionSamples = [],
          waterMotionProbe = null;
        const renderProbe = [];
        if (livingRenderProbe) {
          for (const motion of ["neutral", "live"]) {
            await materializeVerdant();
            renderProbe.push(
              await page.evaluate((motion) => {
                window.__PANTHEON_TEST.prepareCalibrationMovement();
                window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion(motion);
                const environment = window.__A2_CAPTURE_ENV__;
                for (let frame = 0; frame < 60; frame += 1) environment.renderFrame(1 / 30);
                const samples = [];
                for (let frame = 0; frame < 180; frame += 1) {
                  const started = performance.now();
                  environment.renderFrame(1 / 30);
                  samples.push(performance.now() - started);
                }
                samples.sort((a, b) => a - b);
                return {
                  motion,
                  samples: samples.length,
                  medianMs: samples[90],
                  p95Ms: samples[171],
                  maxMs: samples[179],
                  finalTick: environment.observe().tick,
                  resources: window.__TEAR_CATALOG_DEBUG__.verdantCalibration.report(),
                  scope:
                    "Synchronous Class-A renderFrame wall time, including simulation/hash projection; excludes PNG encoding, GPU completion and display pacing",
                };
              }, motion),
            );
          }
          assert.equal(renderProbe[0].finalTick, renderProbe[1].finalTick);
          assert.equal(renderProbe[0].resources.decodedBytes, renderProbe[1].resources.decodedBytes);
          assert.equal(renderProbe[0].resources.decodedResources, renderProbe[1].resources.decodedResources);
        }
        if (imageNativeMotion) {
          waterMotionProbe = await page.evaluate(async (policy) => {
            const environment = window.__A2_CAPTURE_ENV__;
            const calibration = window.__TEAR_CATALOG_DEBUG__.verdantCalibration;
            const canvas = document.getElementById("game");
            calibration.setMotion("neutral");
            const neutralImage = environment.screenshot(policy);
            calibration.setMotion("maximum");
            const maximumImage = environment.screenshot(policy);
            const surface = new OffscreenCanvas(canvas.width, canvas.height);
            const context = surface.getContext("2d", { willReadFrequently: true });
            async function pixels(image) {
              const bitmap = await createImageBitmap(await (await fetch(image)).blob());
              try {
                context.drawImage(bitmap, 0, 0);
                return context.getImageData(0, 0, canvas.width, canvas.height).data;
              } finally {
                bitmap.close();
              }
            }
            const neutralPixels = await pixels(neutralImage),
              maximumPixels = await pixels(maximumImage);
            surface.width = 0;
            surface.height = 0;
            let lowerQuarterChangedPixels = 0;
            for (
              let offset = Math.floor(canvas.height * 0.75) * canvas.width * 4;
              offset < neutralPixels.length;
              offset += 4
            ) {
              if (
                neutralPixels[offset] !== maximumPixels[offset] ||
                neutralPixels[offset + 1] !== maximumPixels[offset + 1] ||
                neutralPixels[offset + 2] !== maximumPixels[offset + 2]
              )
                lowerQuarterChangedPixels += 1;
            }
            calibration.setMotion("neutral");
            return {
              lowerQuarterChangedPixels,
              width: canvas.width,
              height: canvas.height,
              scope:
                "Same frozen world and camera, neutral versus maximum; lower-quarter pixels are below the foliage's registered vertical coverage",
            };
          }, cleanEnvironment);
          assert.ok(
            waterMotionProbe.lowerQuarterChangedPixels > 0,
            "Pool motion must reach visible water pixels, not just foliage",
          );
          await materializeVerdant();
          await page.evaluate(() => {
            window.__PANTHEON_TEST.prepareCalibrationMovement();
            window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("live");
          });
          const finishRecording = await recordCombatVideo(page, "living-idle-motion.mp4");
          try {
            motionSamples = await page.evaluate(async (policy) => {
              const environment = window.__A2_CAPTURE_ENV__;
              const samples = [];
              for (let frame = 0; frame < 180; frame += 1) {
                environment.renderFrame(1 / 30);
                await window.__writeTearCombatFrame(environment.screenshot(policy));
                if (frame % 30 === 0 || frame === 179)
                  samples.push({
                    frame,
                    tick: environment.observe().tick,
                    presentationClockSeconds: environment.presentation().presentationClockSeconds,
                    player: environment.observe().player,
                  });
              }
              return samples;
            }, cleanPlayable);
          } finally {
            video = {
              ...(await finishRecording()),
              timing: "180 production renders at 1/30-second simulation steps; no held frames",
            };
          }
          assert.equal(video.frameCount, 180);
          assert.ok(motionSamples.at(-1).tick - motionSamples[0].tick >= 700);
          await capture("living-motion-final", cleanPlayable);
        }
        fs.writeFileSync(
          path.join(phaseDirectory, "manifest.json"),
          `${JSON.stringify(
            {
              format: imageNativeMotion
                ? "tear-living-stage-idle-motion-prototype"
                : "tear-living-stage-static-prototype",
              build: buildInfo,
              frames: captures,
              resourceReport,
              video,
              motionSamples,
              renderProbe,
              waterMotionProbe,
              observationClass: "A",
              certifying: false,
              limitations: [
                imageNativeMotion
                  ? "Class-A movement preparation parks/stuns enemies; idle diagnostic, not combat"
                  : "Static wave-31 integration only",
                "Motion, exterior matching, water, depth, reactions and performance remain unaccepted",
              ],
            },
            null,
            2,
          )}\n`,
        );
        console.log(`Living-stage static integration passed: ${captures.length} captures`);
        return;
      }
      if (imageNativePlatformLifecycle) {
        assert.equal(imageNativeControl, false);
        await page.evaluate(() => window.__PANTHEON_TEST.startBoss("rootbound", "normal"));
        const finishRecording = platformVideo ? await recordCombatVideo(page, "platform-lifecycle.mp4") : null;
        let result,
          video = null;
        try {
          result = await page.evaluate(
            async ({ policy, application, recordVideo }) => {
              const environment = window.__A2_CAPTURE_ENV__;
              const physical = application ? window.__TEAR_RUNTIME_ENVIRONMENT__.create("C") : null;
              const held = new Set();
              const updateKey = (code, down, receipts) => {
                if (held.has(code) === down) return;
                const input = { type: "key", code, phase: down ? "pressed" : "released" };
                physical.physicalInput(input);
                if (down) held.add(code);
                else held.delete(code);
                receipts.push(input);
              };
              // Normal start replaces the simulation; refresh the observation after
              // that reset before the application-frame monotonic-delta assertion.
              environment.renderFrame(1 / 120);
              let nextId = 1,
                jumped = false,
                released = false,
                clearing = false;
              const samples = [],
                frames = [],
                states = [];
              let targetId = null,
                initialTarget = null,
                ready = false;
              const startup = [];
              for (let frame = 0; frame < 240; frame += 1) {
                environment.advanceApplicationFrame(1 / 30);
                const boss = window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "rootbound");
                startup.push({ frame, tick: environment.observe().tick, boss: boss || null });
                if (boss && boss.spawnT <= 0 && boss.introT === 0) {
                  ready = true;
                  break;
                }
              }
              let snapshot = environment.captureSnapshot("in4-platform-lifecycle-start", "reconstructed-reachable");
              const startingTarget = snapshot.state["tear.platform.v1"].find(
                (platform) => platform.x === 1140 && platform.y === 625,
              );
              if (startingTarget) {
                targetId = startingTarget.arenaPlatId;
                initialTarget = startingTarget;
                states.push(startingTarget.arenaState);
                frames.push({ frame: -1, state: startingTarget.arenaState, image: environment.screenshot(policy) });
              }
              if (recordVideo) await window.__writeTearCombatFrame(environment.screenshot(policy));
              for (let frame = 0; ready && frame < 600; frame += 1) {
                const before = environment.observe();
                const platforms = snapshot.state["tear.platform.v1"];
                if (!targetId) {
                  const target = platforms.find((platform) => platform.x === 1140 && platform.y === 625);
                  if (target) {
                    targetId = target.arenaPlatId;
                    initialTarget = target;
                  }
                }
                const target = platforms.find((platform) => platform.arenaPlatId === targetId);
                if (target?.arenaState === "warning") clearing = true;
                const commands = [
                  { type: "move", x: ready ? (clearing ? -1000 : before.player.x < 1260 ? 1000 : 0) : 0, y: 0 },
                ];
                if (ready && !jumped && before.player.x >= 1080) {
                  commands.push({ type: "jump", phase: "pressed" });
                  jumped = true;
                } else if (jumped && !released) {
                  commands.push({ type: "jump", phase: "released" });
                  released = true;
                }
                if (clearing && before.player.x < 1030) commands[0].x = 0;
                const envelopes = commands.map((command) => ({
                  kind: "command",
                  id: nextId++,
                  tick: before.tick + 1,
                  command,
                }));
                const physicalInputs = [];
                let ended;
                if (application) {
                  updateKey("KeyD", commands[0].x > 0, physicalInputs);
                  updateKey("KeyA", commands[0].x < 0, physicalInputs);
                  for (const command of commands)
                    if (command.type === "jump") updateKey("Space", command.phase === "pressed", physicalInputs);
                  environment.advanceApplicationFrame(1 / 30);
                  ended = ["gameover", "win"].includes(window.__PANTHEON_TEST.state().game);
                } else ended = environment.renderFrame(1 / 30, envelopes).terminated;
                // Keep every command/player sample, but bound expensive visual-hash
                // snapshots to 10 Hz. State facts carry their own observation tick.
                if (frame % 3 === 0)
                  snapshot = environment.captureSnapshot("in4-platform-lifecycle", "reconstructed-reachable");
                const after = snapshot;
                const active = after.state["tear.platform.v1"].find((platform) => platform.arenaPlatId === targetId);
                const run = after.state["tear.run.v1"];
                const broken = (run._arenaBroken || []).find((platform) => platform.arenaPlatId === targetId);
                const observed = active || broken;
                const state = observed?.arenaState || "missing";
                const sample = {
                  frame,
                  tick: environment.observe().tick,
                  commands: application ? undefined : envelopes,
                  physicalInputs: application ? physicalInputs : undefined,
                  player: environment.observe().player,
                  target: observed || null,
                  active: Boolean(active),
                  state,
                  ready,
                  snapshotTick: after.tick,
                  exactHash: after.hashes.exact,
                  run,
                };
                samples.push(sample);
                if (recordVideo) await window.__writeTearCombatFrame(environment.screenshot(policy));
                if (states.at(-1) !== state) {
                  states.push(state);
                  frames.push({ frame, state, image: environment.screenshot(policy) });
                }
                if (states.includes("reforming") && state === "stable") break;
                if (ended || sample.player.hp <= 0) break;
              }
              if (physical) for (const code of [...held]) updateKey(code, false, []);
              if (recordVideo) {
                const finalImage = environment.screenshot(policy);
                for (let hold = 0; hold < 60; hold += 1) await window.__writeTearCombatFrame(finalImage);
              }
              return {
                ready,
                startup,
                targetId,
                initialTarget,
                samples,
                frames,
                states,
                stage: window.__PANTHEON_TEST.bossStage("rootbound"),
              };
            },
            { policy: cleanPlayable, application: platformApplication, recordVideo: platformVideo },
          );
        } finally {
          if (finishRecording) video = await finishRecording();
        }
        for (const frame of result.frames)
          fs.writeFileSync(
            path.join(phaseDirectory, `platform-${frame.frame}-${frame.state}.png`),
            pngBuffer(frame.image),
          );
        fs.writeFileSync(
          path.join(phaseDirectory, "manifest.json"),
          `${JSON.stringify(
            {
              format: "tear-image-native-IN4-natural-platform-probe",
              build: buildInfo,
              resourceReport,
              video,
              framePath: platformApplication ? "application-frame-physical-bridge" : "render-profile-semantic",
              ...result,
              frames: result.frames.map(({ frame, state }) => ({
                frame,
                state,
                file: `platform-${frame}-${state}.png`,
              })),
              certifying: false,
              observationClass: "A",
              limitations: [
                platformApplication
                  ? "Normal Boss Test start and full application frames with physical keyboard bridge; structured Class A controller, not pixel-only autonomy"
                  : "Normal Boss Test start through application frames, followed by semantic render-profile stepping; not continuous full-application pacing",
                "Platform snapshots sampled at 10 Hz with explicit snapshotTick; not exact transition-tick measurement",
                "Not physical-input or pixel-only certification",
              ],
            },
            null,
            2,
          )}\n`,
        );
        assert.equal(result.stage.currentId, result.stage.authoredId);
        assert.equal(result.ready, true, "Application-frame startup must complete before platform input");
        assert.ok(result.targetId, "Authored low platform must be present");
        assert.deepEqual(result.states, ["stable", "stressed", "warning", "broken", "reforming", "stable"]);
        assert.ok(
          result.samples.some((sample) => sample.state === "warning" && sample.target.fractureReason === "standing"),
        );
        assert.ok(result.samples.some((sample) => sample.state === "broken" && !sample.active));
        const first = (state) => result.samples.find((sample) => sample.state === state);
        const stressed = first("stressed"),
          warning = first("warning"),
          broken = first("broken"),
          reforming = first("reforming");
        assert.ok(
          stressed.player.grounded && Math.abs(stressed.player.y + stressed.player.halfHeight - stressed.target.y) <= 8,
          "Stress must be observed while standing on the target",
        );
        assert.ok(
          stressed.player.x + stressed.player.halfWidth > stressed.target.x &&
            stressed.player.x - stressed.player.halfWidth < stressed.target.x + stressed.target.w,
        );
        assert.ok(stressed.target.stress > 0 && warning.target.stress > stressed.target.stress);
        // Sampling may observe each transition up to three render-profile frames
        // late (at most twelve authoritative ticks); do not assert exact ticks.
        assert.ok(
          Math.abs(broken.snapshotTick - warning.snapshotTick - 90) <= 12,
          "Standing warning must retain its 0.75-second timer",
        );
        assert.ok(
          Math.abs(reforming.snapshotTick - broken.snapshotTick - 540) <= 12,
          "Broken platform must retain its 4.5-second timer",
        );
        const recovered = result.samples.at(-1).target;
        for (const key of ["arenaPlatId", "x", "y", "w", "h", "material"])
          assert.equal(recovered[key], result.initialTarget[key]);
        const final = result.samples.at(-1);
        assert.ok(final.active && !final.run._arenaBroken.some((platform) => platform.arenaPlatId === result.targetId));
        assert.ok(
          final.player.x + final.player.halfWidth < recovered.x - 18 ||
            final.player.x - final.player.halfWidth > recovered.x + recovered.w + 18,
          "Player must clear the recovery footprint",
        );
        assert.ok(
          Math.abs(final.snapshotTick - broken.snapshotTick - 612) <= 12,
          "Recovery must retain the 5.1-second total timer",
        );
        return;
      }
      if (imageNativeCombat) {
        assert.equal(imageNativeControl, false);
        let combatBaseline = null;
        if (combatBaselinePhase) {
          assert.match(combatBaselinePhase, /^verification-[a-z0-9-]+$/u);
          assert.notEqual(combatBaselinePhase, phase);
          combatBaseline = JSON.parse(
            fs.readFileSync(path.join(outputRoot, combatBaselinePhase, "manifest.json"), "utf8"),
          );
          assert.ok(
            Array.isArray(combatBaseline.samples) &&
              combatBaseline.samples.length > 0 &&
              combatBaseline.samples.every(
                (sample) => typeof sample.canonicalStateHash === "string" && sample.canonicalStateHash.length > 0,
              ),
            "Combat baseline lacks canonical hashes; it cannot support exact gameplay comparison",
          );
        }
        const defaults = { gfx: "high", reducedMotion: false, highContrast: false, flash: 1 };
        const settings = {
          default: defaults,
          "flash-zero": { ...defaults, flash: 0 },
          "reduced-motion": { ...defaults, reducedMotion: true },
          "low-graphics": { ...defaults, gfx: "low" },
          "high-contrast": { ...defaults, highContrast: true },
          combined: { gfx: "low", reducedMotion: true, highContrast: true, flash: 0 },
        }[combatProfile];
        assert.ok(settings, "Use a named combat accessibility profile");
        await page.evaluate((settings) => window.__PANTHEON_TEST.setOptions(settings), settings);
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("live"));
        const combatResolved = structuredClone(verdantResolved);
        combatResolved.document.id = combatResolved.scenario.id = "in4-verdant-wave-39-combat";
        combatResolved.document.start.wave = combatResolved.scenario.start.wave = 39;
        combatResolved.document.maxTicks = combatResolved.scenario.maxTicks = 3000;
        combatResolved.resolvedHash = "in4-verdant-wave-39-combat";
        combatResolved.document.stateClass = combatResolved.scenario.stateClass = "surgical-valid";
        combatResolved.document.constraints = {};
        combatResolved.reachability = {
          reachable: false,
          reasons: ["Authored mixed encounter; no natural wave-history claim"],
        };
        combatResolved.plausibility = {
          plausible: true,
          provisional: true,
          reasons: ["Readability fixture with canonical Verdant enemy factories"],
        };
        combatResolved.document.state = {
          "tear.run.v1": { spawnQueue: [], spawnTimer: 0 },
          enemyComposition: [
            { kind: "ranged", count: 1, x: 220, y: 620 },
            { kind: "ranged", count: 1, x: 1380, y: 620 },
            { kind: "flyer", count: 1, x: 520, y: 270 },
            { kind: "flyer", count: 1, x: 1080, y: 330 },
            { kind: "charger", count: 1, x: 420, y: 775 },
            { kind: "charger", count: 1, x: 1180, y: 775 },
            { kind: "rootbinder", count: 1, x: 330, y: 775 },
            { kind: "armored", count: 1, x: 1280, y: 775 },
          ],
        };
        const finishRecording = imageNativeCombatVideo ? await recordCombatVideo(page) : null;
        let video = null;
        let result;
        try {
          result = await page.evaluate(
            async ({ resolved, policy, recordVideo }) => {
              const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
              window.__A2_CAPTURE_ENV__ = environment;
              const launched = environment.forgeResolvedScenario(resolved);
              if (!launched.ok) throw new Error(JSON.stringify(launched));
              let nextId = 1;
              let direction = 1000;
              const frames = [],
                samples = [];
              let failure = null;
              if (recordVideo) await window.__writeTearCombatFrame(environment.screenshot(policy));
              for (let frame = 0; frame < 600; frame += 1) {
                const before = environment.observe();
                if (before.player.x > 1400) direction = -1000;
                else if (before.player.x < 200) direction = 1000;
                const commands = [{ type: "move", x: frame < 15 ? 0 : direction, y: 0 }];
                // Let the canonical wave enter before attacking. The prior probe
                // immediately swept incoming enemies and never exercised a crowd.
                if (frame < 180) commands.push({ type: "aim", turn: 750000, magnitude: 1000 });
                if (frame % 45 === 15) commands.push({ type: "jump", phase: "pressed" });
                if (frame % 45 === 16) commands.push({ type: "jump", phase: "released" });
                const target = before.entities
                  .filter((actor) => actor.kind !== "projectile" && actor.hpRatio > 0)
                  .sort(
                    (a, b) =>
                      Math.hypot(a.x - before.player.x, a.y - before.player.y) -
                      Math.hypot(b.x - before.player.x, b.y - before.player.y),
                  )[0];
                if (target && frame >= 180) {
                  const radians = Math.atan2(target.y - before.blade.handY, target.x - before.blade.handX);
                  commands.push({
                    type: "aim",
                    turn: Math.round(((((radians / (Math.PI * 2)) % 1) + 1) % 1) * 1000000) % 1000000,
                    magnitude: 1000,
                  });
                  if (frame >= 180 && frame % 30 === 0)
                    commands.push({ type: "weapon", intent: "throw", phase: "pressed" });
                  if (frame >= 180 && frame % 30 === 15)
                    commands.push({ type: "weapon", intent: "recall", phase: "pressed" });
                }
                let transition;
                try {
                  transition = environment.renderFrame(
                    1 / 30,
                    commands.map((command) => ({
                      kind: "command",
                      id: nextId++,
                      tick: before.tick + 1,
                      command,
                    })),
                  );
                } catch (error) {
                  failure = {
                    frame,
                    beforeTick: before.tick,
                    commands,
                    message: String(error),
                    snapshot: environment.captureSnapshot("in4-combat-failure", "reconstructed-reachable"),
                  };
                  frames.push({ frame, image: environment.screenshot(policy) });
                  break;
                }
                const observation = environment.observe();
                const state = environment.environment().snapshot();
                const sample = {
                  frame,
                  tick: observation.tick,
                  canonicalStateHash: transition.info.canonicalStateHash,
                  player: observation.player,
                  run: observation.run,
                  enemies: observation.entities.filter((actor) => actor.kind !== "projectile"),
                  projectiles: observation.entities.filter((actor) => actor.kind === "projectile"),
                  bloomStates: state.fields.filter((field) => field.kind === "bloom-well").map((field) => field.state),
                  combatObjects: state.combatObjects,
                  screen: window.__PANTHEON_TEST.state().game,
                };
                samples.push(sample);
                if (recordVideo) await window.__writeTearCombatFrame(environment.screenshot(policy));
                if (frame % 30 === 0 || frame === 599) frames.push({ frame, image: environment.screenshot(policy) });
                if (observation.player.hp <= 0 || transition.terminated || sample.screen !== "playing") break;
              }
              if (recordVideo) {
                const finalImage = environment.screenshot(policy);
                for (let hold = 0; hold < 60; hold += 1) await window.__writeTearCombatFrame(finalImage);
              }
              return {
                launched,
                samples,
                frames,
                events: environment.events(),
                failure,
                settings: environment.presentation().settings,
              };
            },
            { resolved: combatResolved, policy: cleanPlayable, recordVideo: imageNativeCombatVideo },
          );
        } finally {
          if (finishRecording) video = await finishRecording();
        }
        for (const frame of result.frames)
          fs.writeFileSync(
            path.join(phaseDirectory, `combat-${String(frame.frame).padStart(3, "0")}.png`),
            pngBuffer(frame.image),
          );
        fs.writeFileSync(
          path.join(phaseDirectory, "manifest.json"),
          `${JSON.stringify(
            {
              format: imageNativeLiving ? "tear-living-stage-combat-probe" : "tear-image-native-IN4-combat-probe",
              build: buildInfo,
              resourceReport,
              profile: combatProfile,
              requestedSettings: settings,
              observedSettings: result.settings,
              scenario: combatResolved,
              launched: result.launched,
              samples: result.samples,
              events: result.events,
              failure: result.failure,
              video,
              frames: result.frames.map(({ frame }) => ({
                frame,
                file: `combat-${String(frame).padStart(3, "0")}.png`,
              })),
              certifying: false,
              limitations: [
                "Class A surgical mixed Verdant encounter with structured semantic aim/move/jump/throw/recall commands; not a naturally reached wave",
                imageNativeCombatVideo
                  ? "Continuous 30-fps runtime capture with a two-second final hold; not a complete calm/combat/recovery journey or physical-input certification"
                  : "One-second keyframes are a fixture probe, not the required combat/recovery clip or physical-input certification",
              ],
            },
            null,
            2,
          )}\n`,
        );
        assert.equal(result.failure === null, true, result.failure?.message);
        assert.equal(result.settings.lowGraphics, settings.gfx === "low");
        assert.equal(result.settings.highContrast, settings.highContrast);
        assert.equal(result.settings.reducedMotion, settings.reducedMotion);
        assert.equal(result.settings.flashScale, settings.flash);
        assert.ok(
          result.samples.every(
            (sample) => typeof sample.canonicalStateHash === "string" && sample.canonicalStateHash.length > 0,
          ),
        );
        if (combatBaseline) {
          const baseline = combatBaseline;
          assert.equal(result.samples.length, baseline.samples.length, "Settings changed the encounter duration");
          const divergence = result.samples.findIndex(
            (sample, index) =>
              sample.tick !== baseline.samples[index].tick ||
              sample.canonicalStateHash !== baseline.samples[index].canonicalStateHash,
          );
          assert.equal(divergence, -1, `Settings changed canonical gameplay at frame ${divergence}`);
        }
        assert.ok(
          result.samples.some((sample) => sample.enemies.length >= 6),
          "Dense combat evidence requires at least six simultaneous enemies",
        );
        assert.ok(
          result.samples.some((sample) => sample.projectiles.length > 0),
          "Projectile contrast needs a real projectile in view",
        );
        return;
      }
      if (imageNativePlatformStates) {
        assert.equal(imageNativeControl, false, "Platform-state evidence requires the IN3 package");
        const defaults = { gfx: "high", reducedMotion: false, highContrast: false, flash: 1 };
        const profiles = [
          ["default", defaults],
          ["flash-zero", { ...defaults, flash: 0 }],
          ["reduced-motion", { ...defaults, reducedMotion: true }],
          ["low-graphics", { ...defaults, gfx: "low" }],
          ["high-contrast", { ...defaults, highContrast: true }],
          ["combined", { gfx: "low", reducedMotion: true, highContrast: true, flash: 0 }],
        ];
        const geometry = (platforms) => platforms.map(({ x, y, w, h }) => ({ x, y, w, h }));
        for (const [viewport, width, height] of [
          ["desktop", 1600, 900],
          ["touch-landscape", 896, 414],
        ]) {
          await page.setViewportSize({ width, height });
          for (const [profile, settings] of profiles) {
            await page.evaluate((settings) => window.__PANTHEON_TEST.setOptions(settings), settings);
            await materializeVerdant();
            const origin = await page.evaluate(() =>
              window.__A2_CAPTURE_ENV__.captureSnapshot("in4-platform-origin", "reconstructed-reachable"),
            );
            const indices = origin.state["tear.platform.v1"].flatMap((platform, index) =>
              platform.y < 800 ? [index] : [],
            );
            assert.ok(indices.length > 1, "Capture both bright and dark elevated platform regions");
            let stable;
            for (const [sample, state] of [
              "stable",
              "stressed",
              "warning",
              "broken",
              "reforming",
              "stable",
            ].entries()) {
              await page.evaluate(
                ({ indices, state }) => {
                  for (const index of indices) window.__PANTHEON_TEST.setCalibrationPlatformState(index, state);
                },
                { indices, state },
              );
              const frame = await capture(`platform-${viewport}-${profile}-${sample}-${state}`, cleanPlayable, {
                viewport,
                profile,
                settings,
                state,
                indices,
                observationClass: "A",
                stimulus: "test-only material-state fixture; not natural collapse/reform simulation",
              });
              assert.deepEqual(geometry(frame.platforms), geometry(origin.state["tear.platform.v1"]));
              for (const index of indices) {
                assert.equal(frame.platforms[index].arenaState, state === "stressed" ? "stable" : state);
                assert.equal(frame.platforms[index].stress, state === "stressed" ? 0.6 : 0);
              }
              if (!stable) stable = frame;
              assert.deepEqual(frame.observation.player, stable.observation.player);
              assert.deepEqual(frame.environmentState, stable.environmentState);
              if (sample === 5)
                assert.equal(frame.exactHash, stable.exactHash, "Material fixture must return to its initial state");
            }
          }
        }
        fs.writeFileSync(
          path.join(phaseDirectory, "manifest.json"),
          `${JSON.stringify(
            {
              format: "tear-image-native-IN4-platform-states",
              build: buildInfo,
              frames: captures,
              resourceReport,
              certifying: false,
              limitations: [
                "Class A direct material-state preparation through the existing test-only hook; not collision or natural lifecycle proof",
                "Static desktop and small-landscape frames require visual inspection; not touch-input or dense-combat acceptance",
              ],
            },
            null,
            2,
          )}\n`,
        );
        return;
      }
      if (imageNativeAccessibility) {
        assert.equal(imageNativeControl, false, "Accessibility evidence requires an animated package");
        const motionPolicyProbes = [];
        const defaults = { gfx: "high", reducedMotion: false, highContrast: false, flash: 1 };
        const profiles = [
          ["default", defaults],
          ["flash-zero", { ...defaults, flash: 0 }],
          ["reduced-motion", { ...defaults, reducedMotion: true }],
          ["low-graphics", { ...defaults, gfx: "low" }],
          ["high-contrast", { ...defaults, highContrast: true }],
          ["combined", { gfx: "low", reducedMotion: true, highContrast: true, flash: 0 }],
          ["default-restored", defaults],
        ];
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("maximum"));
        for (const [viewport, width, height] of [
          ["desktop", 1600, 900],
          ["touch-landscape", 896, 414],
        ]) {
          await page.setViewportSize({ width, height });
          let first;
          for (const [label, settings] of profiles) {
            const policy = await page.evaluate((settings) => {
              window.__PANTHEON_TEST.setOptions(settings);
              const state = window.__PANTHEON_TEST.state();
              return {
                reducedMotion: state.reducedMotion,
                highContrast: state.highContrast,
                lowEffects: state.lowEffects,
                flash: window.__A2_CAPTURE_ENV__.presentation().settings.flashScale,
              };
            }, settings);
            assert.deepEqual(policy, {
              reducedMotion: settings.reducedMotion,
              highContrast: settings.highContrast,
              lowEffects: settings.gfx === "low",
              flash: settings.flash,
            });
            const frame = await capture(`accessibility-${viewport}-${label}`, cleanPlayable, {
              settings,
              viewport,
              observationClass: "A",
              diagnosticMotion: "maximum",
            });
            if (!first) first = frame;
            assert.deepEqual(frame.platforms, first.platforms, "Accessibility must preserve platform state");
            assert.deepEqual(
              frame.observation.player,
              first.observation.player,
              "Accessibility must preserve player state",
            );
            if (label === "default-restored")
              assertPNGEqual(frame.image, first.image, "Restored settings must reproduce exact pixels");
            if (imageNativeLiving) {
              const probe = await page.evaluate(async (capturePolicy) => {
                const environment = window.__A2_CAPTURE_ENV__;
                const calibration = window.__TEAR_CATALOG_DEBUG__.verdantCalibration;
                const canvas = document.getElementById("game");
                const before = environment.captureSnapshot("living-policy-before", "reconstructed-reachable").hashes
                  .exact;
                calibration.setMotion("neutral");
                const neutralImage = environment.screenshot(capturePolicy);
                calibration.setMotion("maximum");
                const maximumImage = environment.screenshot(capturePolicy);
                // Read decoded captures on a separate CPU surface. Reading the live
                // canvas can demote its GPU backend between the compared renders.
                const surface = new OffscreenCanvas(canvas.width, canvas.height);
                const context = surface.getContext("2d", { willReadFrequently: true });
                async function pixels(image) {
                  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
                  try {
                    context.drawImage(bitmap, 0, 0);
                    return context.getImageData(0, 0, canvas.width, canvas.height).data;
                  } finally {
                    bitmap.close();
                  }
                }
                const neutralPixels = await pixels(neutralImage),
                  maximumPixels = await pixels(maximumImage);
                surface.width = 0;
                surface.height = 0;
                let changedPixels = 0,
                  lowerQuarterChangedPixels = 0;
                const lowerQuarterStart = Math.floor(canvas.height * 0.75) * canvas.width * 4;
                for (let offset = 0; offset < neutralPixels.length; offset += 4) {
                  if (
                    neutralPixels[offset] !== maximumPixels[offset] ||
                    neutralPixels[offset + 1] !== maximumPixels[offset + 1] ||
                    neutralPixels[offset + 2] !== maximumPixels[offset + 2] ||
                    neutralPixels[offset + 3] !== maximumPixels[offset + 3]
                  ) {
                    changedPixels += 1;
                    if (offset >= lowerQuarterStart) lowerQuarterChangedPixels += 1;
                  }
                }
                return {
                  neutralImage,
                  maximumImage,
                  changedPixels,
                  lowerQuarterChangedPixels,
                  width: canvas.width,
                  height: canvas.height,
                  before,
                  after: environment.captureSnapshot("living-policy-after", "reconstructed-reachable").hashes.exact,
                };
              }, cleanEnvironment);
              fs.writeFileSync(
                path.join(phaseDirectory, `motion-${viewport}-${label}-neutral.png`),
                pngBuffer(probe.neutralImage),
              );
              fs.writeFileSync(
                path.join(phaseDirectory, `motion-${viewport}-${label}-maximum.png`),
                pngBuffer(probe.maximumImage),
              );
              delete probe.neutralImage;
              delete probe.maximumImage;
              assert.equal(probe.after, probe.before, "Motion policy probes must preserve exact gameplay state");
              const motionDisabled = settings.reducedMotion || settings.gfx === "low" || settings.highContrast;
              if (motionDisabled)
                assert.equal(probe.changedPixels, 0, `${label} must neutralize foliage and pool motion`);
              else assert.ok(probe.changedPixels > 0, `${label} must retain visible foliage motion`);
              if (motionDisabled || settings.flash === 0)
                assert.equal(probe.lowerQuarterChangedPixels, 0, `${label} must neutralize pool refraction`);
              else if (viewport === "desktop")
                assert.ok(probe.lowerQuarterChangedPixels > 0, "Default desktop must retain visible pool refraction");
              motionPolicyProbes.push({ viewport, label, settings, ...probe });
            }
            assert.deepEqual(await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.report()), {
              ...resourceReport,
              motionView: "maximum",
            });
          }
        }
        fs.writeFileSync(
          path.join(phaseDirectory, "manifest.json"),
          `${JSON.stringify(
            {
              format: imageNativeLiving ? "tear-living-stage-accessibility" : "tear-image-native-IN4-accessibility",
              build: buildInfo,
              frames: captures,
              resourceReport,
              motionPolicyProbes,
              certifying: false,
              limitations: [
                "Class A static wave-31 maximum-motion fixture; not combat or lifecycle acceptance",
                "Pixel captures require visual review; state assertions alone do not prove readability",
              ],
            },
            null,
            2,
          )}\n`,
        );
        return;
      }
      if (imageNativeBoss) {
        assert.equal(imageNativeControl, false);
        if (imageNativeLiving)
          await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("live"));
        const expiryEvidence = bossRecovery || bossResponseVideo;
        const bossFrameLimit = expiryEvidence ? 1800 : bossCanopyOnly || bossLatePhases ? 1320 : 900;
        const runs = [];
        for (const [profile, settings] of [
          ["default", { gfx: "high", reducedMotion: false, highContrast: false, flash: 1 }],
          ["combined", { gfx: "low", reducedMotion: true, highContrast: true, flash: 0 }],
        ].filter(([profile]) => !bossResponseVideo || profile === "default")) {
          await page.evaluate((settings) => window.__PANTHEON_TEST.setOptions(settings), settings);
          for (const [bossPhase, health] of expiryEvidence
            ? [[3, 0.2]]
            : bossCanopyOnly
              ? [[1, 1]]
              : bossLatePhases
                ? [
                    [2, 0.5],
                    [3, 0.2],
                  ]
                : [
                    [1, 1],
                    [2, 0.5],
                    [3, 0.2],
                  ]) {
            const finishRecording = bossResponseVideo
              ? await recordCombatVideo(page, "rootbound-response-recovery.mp4")
              : null;
            let video = null;
            const result = await page
              .evaluate(
                async ({ health, policy, frameLimit, latePhases, recovery, recordVideo, expiry }) => {
                  const environment = window.__A2_CAPTURE_ENV__;
                  const scenario = {
                    format: "tear-contract",
                    kind: "scenario",
                    schemaVersion: 1,
                    id: "in4-rootbound-natural-start",
                    version: 1,
                    description: "Rootbound readability from the ordinary boss start",
                    stateClass: "recorded-canonical",
                    executionClass: "engineering",
                    seed: "in4-rootbound-readability",
                    start: { mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "rootbound" },
                    maxTicks: 2400,
                    assertions: ["runtime.finite-state", "entity.unique-id", "player.valid-health"],
                    tags: ["scene-direction", "in4"],
                  };
                  environment.reset(scenario);
                  const resetBefore = recovery
                    ? {
                        hash: environment.stateHash(),
                        snapshot: environment.captureSnapshot("in4-reset-boundary", "recorded-canonical"),
                        environment: environment.environment().snapshot(),
                        image: environment.screenshot(policy),
                      }
                    : null;
                  const introSamples = [];
                  let introComplete = false;
                  for (let frame = 0; frame < 480; frame += 1) {
                    environment.advanceApplicationFrame(1 / 120);
                    if (frame % 12 !== 0) continue;
                    const snapshot = environment.captureSnapshot("in4-boss-intro", "recorded-canonical");
                    const boss = snapshot.state["tear.boss.v1"].find((actor) => actor.bossId === "rootbound");
                    introSamples.push({ frame, tick: environment.observe().tick, boss: boss ?? null });
                    if (boss && boss.introT === 0) {
                      introComplete = true;
                      break;
                    }
                  }
                  if (!introComplete)
                    throw new Error("Natural Rootbound intro did not complete within 480 application frames");
                  if (health < 1) window.__PANTHEON_TEST.setBossHealthFraction(health);
                  const frames = [],
                    samples = [],
                    hashes = [];
                  let lastCue = "",
                    failure = null;
                  for (let frame = 0; frame < frameLimit; frame += 1) {
                    environment.advanceApplicationFrame(1 / 120);
                    const observation = environment.observe();
                    hashes.push({ frame, tick: observation.tick, observedStateHash: environment.stateHash() });
                    if (recordVideo && frame % 4 === 0)
                      await window.__writeTearCombatFrame(environment.screenshot(policy));
                    if (frame % 12 !== 0 && frame !== frameLimit - 1) continue;
                    const snapshot = environment.captureSnapshot(
                      "in4-boss-readability",
                      health < 1 ? "surgical-valid" : "recorded-canonical",
                    );
                    const actors = snapshot.state["tear.boss.v1"];
                    const boss = actors.find((actor) => actor.bossId === "rootbound");
                    if (!boss) throw new Error("Rootbound actor missing from boss readability fixture");
                    const state = environment.environment().snapshot();
                    const cue = JSON.stringify([
                      boss.phaseMarker,
                      boss.atk,
                      boss.vineSweepStage,
                      boss.seedArcStage,
                      boss.rootlineStage,
                      boss.canopyStepStage,
                      boss.memoryChoirStage,
                      boss.lastSpringStage,
                      state.combatObjects.map((object) => [object.factoryId, object.state]),
                      ...(latePhases
                        ? [
                            boss.bloomPatternIndex,
                            state.fields.map((field) => [field.id, field.patternId, field.state]),
                          ]
                        : []),
                    ]);
                    const sample = {
                      frame,
                      tick: observation.tick,
                      observedStateHash: environment.stateHash(),
                      boss,
                      player: observation.player,
                      fields: state.fields,
                      combatObjects: state.combatObjects,
                      ...(expiry ? { routes: state.routes } : {}),
                      projectiles: observation.entities.filter((actor) => actor.kind === "projectile"),
                      screen: window.__PANTHEON_TEST.state().game,
                    };
                    samples.push(sample);
                    if (cue !== lastCue || frame % 120 === 0 || (expiry && frame === frameLimit - 1)) {
                      frames.push({ frame, tick: observation.tick, cue, image: environment.screenshot(policy) });
                      lastCue = cue;
                    }
                    if (sample.screen !== "playing") {
                      failure = { frame, tick: observation.tick, screen: sample.screen };
                      break;
                    }
                  }
                  if (recordVideo) {
                    const finalImage = environment.screenshot(policy);
                    for (let hold = 0; hold < 60; hold += 1) await window.__writeTearCombatFrame(finalImage);
                  }
                  let resetAfter = null;
                  if (recovery && !failure) {
                    environment.reset(scenario);
                    resetAfter = {
                      hash: environment.stateHash(),
                      snapshot: environment.captureSnapshot("in4-reset-boundary", "recorded-canonical"),
                      environment: environment.environment().snapshot(),
                      image: environment.screenshot(policy),
                    };
                  }
                  return {
                    scenario,
                    introSamples,
                    samples,
                    hashes,
                    frames,
                    failure,
                    resetBefore,
                    resetAfter,
                    settings: environment.presentation().settings,
                  };
                },
                {
                  health,
                  policy: cleanPlayable,
                  frameLimit: bossFrameLimit,
                  latePhases: bossLatePhases || expiryEvidence,
                  recovery: bossRecovery,
                  recordVideo: bossResponseVideo,
                  expiry: expiryEvidence,
                },
              )
              .finally(async () => {
                if (finishRecording)
                  video = {
                    ...(await finishRecording()),
                    timing:
                      "Production application steps at 120 Hz; one rendered frame sampled every four steps for 30 fps, followed by a two-second frozen hold",
                    preparation:
                      "Ordinary boss intro completed before recording; phase-three health prepared through the existing test hook; no reset in this clip",
                  };
              });
            const frames = result.frames.map(({ image, ...frame }) => {
              const bytes = pngBuffer(image);
              const file = `boss-${profile}-phase-${bossPhase}-${String(frame.frame).padStart(3, "0")}.png`;
              fs.writeFileSync(path.join(phaseDirectory, file), bytes);
              return { ...frame, file, sha256: sha256(bytes) };
            });
            if (bossRecovery)
              for (const key of ["resetBefore", "resetAfter"]) {
                if (!result[key]) continue;
                const bytes = pngBuffer(result[key].image),
                  file = `boss-${profile}-${key}.png`;
                fs.writeFileSync(path.join(phaseDirectory, file), bytes);
                result[key] = { ...result[key], image: undefined, file, sha256: sha256(bytes) };
              }
            runs.push({
              ...result,
              frames,
              profile,
              bossPhase,
              requestedSettings: settings,
              ...(video ? { video } : {}),
            });
            fs.writeFileSync(
              path.join(phaseDirectory, "manifest.json"),
              `${JSON.stringify(
                {
                  format: "tear-image-native-IN4-boss-readability",
                  build: buildInfo,
                  resourceReport,
                  runs,
                  certifying: false,
                  limitations: [
                    bossCanopyOnly
                      ? "Class A ordinary phase-one boss start without health preparation; no physical input or autonomous combat policy"
                      : "Class A ordinary boss start; phases two and three use surgical health preparation; no physical input or autonomous combat policy",
                    "Unmoved player and naturally selected attacks; only observed regions and cues are covered",
                    "Boss/environment inspection every 12 application frames; runtime hashes every application frame",
                    bossRecovery
                      ? "Bounded natural field expiry and world reset only; not seek, retry, or the native restore-image investigation"
                      : "Does not resolve the native restore-image discrepancy or certify retry/recovery",
                  ],
                },
                null,
                2,
              )}\n`,
            );
            assert.equal(result.failure, null, JSON.stringify(result.failure));
            assert.equal(result.hashes.length, bossFrameLimit);
            if (expiryEvidence) {
              const tail = result.samples.filter((sample) => sample.tick >= result.samples.at(-1).tick - 120);
              assert.ok(tail.length >= 10, "Recovery requires a full sampled second");
              assert.ok(
                tail.every(
                  (sample) =>
                    sample.boss.lastSpringStage === "complete" &&
                    sample.fields.every((field) => field.state === "dormant") &&
                    sample.combatObjects.every(
                      (object) =>
                        sample.boss.regrowthState.requiredConnectionIds.includes(object.id) &&
                        object.state === "expired" &&
                        object.cleanupReason === "natural-expiry",
                    ) &&
                    sample.routes.every(
                      (route) => route.state === "expired" && route.cleanupReason === "natural-expiry",
                    ) &&
                    sample.projectiles.length === 0,
                ),
                "Recovery must naturally settle fields and Regrowth records for a sampled second",
              );
            }
            if (bossRecovery) {
              assert.ok(result.resetBefore && result.resetAfter, "Both reset boundaries are required");
              assert.equal(
                result.resetAfter.hash,
                result.resetBefore.hash,
                "World reset must restore the original runtime hash",
              );
              assert.deepEqual(
                result.resetAfter.snapshot.state,
                result.resetBefore.snapshot.state,
                "World reset must restore the original snapshot state",
              );
              assert.deepEqual(
                result.resetAfter.environment,
                result.resetBefore.environment,
                "World reset must remove encounter fields and objects",
              );
            }
            if (bossCanopyOnly)
              for (const stage of ["telegraph", "travel", "settle"]) {
                assert.ok(
                  result.samples.some((sample) => sample.boss.canopyStepStage === stage),
                  `Missing Canopy Step ${stage}`,
                );
              }
            if (bossLatePhases && bossPhase === 2) {
              const initialPattern = result.samples[0].boss.bloomPatternIndex;
              const shiftedIndex = result.samples.findIndex(
                (sample) => sample.boss.bloomPatternIndex !== initialPattern,
              );
              const shifted = result.samples[shiftedIndex];
              assert.ok(shifted, "Bloom Shift must change its authoritative pattern index");
              assert.ok(shiftedIndex > 0, "Bloom Shift requires a pre-shift observation");
              const initialIds = new Set(
                result.samples[shiftedIndex - 1].fields.filter((field) => field.bossOwnerId).map((field) => field.id),
              );
              for (const state of ["warning", "active"])
                assert.ok(
                  result.samples.some(
                    (sample) =>
                      sample.tick >= shifted.tick &&
                      sample.fields.some(
                        (field) => field.bossOwnerId && !initialIds.has(field.id) && field.state === state,
                      ),
                  ),
                  `Shifted boss Bloom fields must reach ${state}`,
                );
            }
            if (bossLatePhases && bossPhase === 3)
              for (const stage of ["warning", "bloom", "commit", "punish", "complete"]) {
                assert.ok(
                  result.samples.some((sample) => sample.boss.lastSpringStage === stage),
                  `Missing Last Spring ${stage}`,
                );
              }
            assert.equal(result.settings.lowGraphics, settings.gfx === "low");
            assert.equal(result.settings.highContrast, settings.highContrast);
            assert.equal(result.settings.reducedMotion, settings.reducedMotion);
            assert.equal(result.settings.flashScale, settings.flash);
            assert.ok(
              result.samples.some((sample) => sample.boss.atk !== "unavailable"),
              "Boss must execute an actual attack",
            );
            assert.ok(
              result.samples.every(
                (sample) => typeof sample.observedStateHash === "string" && sample.observedStateHash.length > 0,
              ),
            );
            if (bossBaselinePhase) {
              assert.match(bossBaselinePhase, /^verification-[a-z0-9-]+$/u);
              assert.notEqual(bossBaselinePhase, phase);
              const baseline = JSON.parse(
                fs.readFileSync(path.join(outputRoot, bossBaselinePhase, "manifest.json"), "utf8"),
              ).runs.find((run) => run.profile === profile && run.bossPhase === bossPhase);
              assert.ok(baseline, "Matching boss baseline run is required");
              assert.deepEqual(
                result.hashes,
                baseline.hashes,
                "Presentation correction must preserve the baseline boss runtime hashes",
              );
            }
            if (profile === "combined") {
              const baseline = runs.find((run) => run.profile === "default" && run.bossPhase === bossPhase);
              assert.deepEqual(
                result.hashes.map((sample) => [sample.tick, sample.observedStateHash]),
                baseline.hashes.map((sample) => [sample.tick, sample.observedStateHash]),
                "Boss settings must preserve observed runtime state",
              );
            }
          }
        }
        return;
      }
      if (imageNativeResponses) {
        assert.equal(imageNativeControl, false);
        const responses = [];
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("live"));
        const responseProfiles = [
          ["default", { gfx: "high", reducedMotion: false, highContrast: false, flash: 1 }],
          ["low-only", { gfx: "low", reducedMotion: false, highContrast: false, flash: 1 }],
          ["combined", { gfx: "low", reducedMotion: true, highContrast: true, flash: 0 }],
        ].filter(([profile]) => (responseProfile ? profile === responseProfile : profile !== "low-only"));
        for (const [profile, settings] of responseProfiles) {
          const particleBoundaries = [];
          const readParticleBoundary = async (label) => {
            const raw = await page.evaluate(() => {
              const context = document.getElementById("game").getContext("2d");
              const transform = context.getTransform();
              const style = (value) =>
                typeof value === "string"
                  ? { kind: "string", value }
                  : {
                      kind: String(value),
                      value: null,
                      limitation: "Native gradient/pattern internals are not readable",
                    };
              return {
                presentation: window.__PANTHEON_TEST.presentationDiagnostics(),
                nativeContext: {
                  attributes: context.getContextAttributes(),
                  transform: [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
                  globalAlpha: context.globalAlpha,
                  globalCompositeOperation: context.globalCompositeOperation,
                  filter: context.filter,
                  shadowBlur: context.shadowBlur,
                  shadowColor: context.shadowColor,
                  shadowOffsetX: context.shadowOffsetX,
                  shadowOffsetY: context.shadowOffsetY,
                  imageSmoothingEnabled: context.imageSmoothingEnabled,
                  imageSmoothingQuality: context.imageSmoothingQuality,
                  fillStyle: style(context.fillStyle),
                  strokeStyle: style(context.strokeStyle),
                  lineWidth: context.lineWidth,
                  lineCap: context.lineCap,
                  lineJoin: context.lineJoin,
                  miterLimit: context.miterLimit,
                  lineDash: context.getLineDash(),
                  lineDashOffset: context.lineDashOffset,
                  font: context.font,
                  textAlign: context.textAlign,
                  textBaseline: context.textBaseline,
                  direction: context.direction,
                  limitation: "Current path and clip geometry are not readable; no draw interception used",
                },
              };
            });
            particleBoundaries.push({ label, raw });
            fs.writeFileSync(
              path.join(phaseDirectory, `particles-${profile}-diagnostic.json`),
              `${JSON.stringify(
                {
                  build: buildInfo,
                  profile,
                  responseSequence,
                  certifying: false,
                  boundaries: particleBoundaries,
                  limitation:
                    "Read-only raw owner/input observation; strict native state/hash/PNG assertions remain unchanged",
                },
                null,
                2,
              )}\n`,
            );
            return raw;
          };
          await page.evaluate((settings) => window.__PANTHEON_TEST.setOptions(settings), settings);
          const actualSettings = await page.evaluate(() => window.__A2_CAPTURE_ENV__.presentation().settings);
          assert.equal(actualSettings.lowGraphics, settings.gfx === "low");
          assert.equal(actualSettings.highContrast, settings.highContrast);
          assert.equal(actualSettings.reducedMotion, settings.reducedMotion);
          assert.equal(actualSettings.flashScale, settings.flash);
          const bloomForge = await materializeVerdant();
          assert.equal(bloomForge.ok, true, JSON.stringify(bloomForge));
          let previousTick = await page.evaluate(() => window.__A2_CAPTURE_ENV__.observe().tick);
          assert.ok(previousTick < 84, "Authored Bloom capture must start during warning");
          for (const [tick, state] of [
            [previousTick, "warning"],
            [84, "active"],
            [264, "cooldown"],
            [744, "dormant"],
          ]) {
            await page.evaluate((ticks) => {
              for (let index = 0; index < ticks; index += 1) window.__A2_CAPTURE_ENV__.step([]);
            }, tick - previousTick);
            previousTick = tick;
            const frame = await capture(`response-${profile}-bloom-${state}`, cleanPlayable, {
              profile,
              mechanic: "bloom-well",
              lifecycleTick: tick,
            });
            const wells = frame.environmentState.fields.filter(
              (field) => field.kind === "bloom-well" && field.variant === "stage",
            );
            assert.equal(wells.length, 2);
            assert.ok(
              wells.every((well) => well.state === state),
              JSON.stringify(wells),
            );
          }
          const graftForge = await page.evaluate(() => window.__A2_CAPTURE_ENV__.forgeRootboundGraftAnchor());
          assert.equal(graftForge.ok, true, JSON.stringify(graftForge));
          const phaseTwo = await page.evaluate(() => {
            const environment = window.__A2_CAPTURE_ENV__;
            window.__PANTHEON_TEST.setBossHealthFraction(0.5);
            for (let tick = 0; tick < 1200; tick += 1) {
              environment.advanceApplicationFrame(1 / 120);
              const anchors = environment
                .environment()
                .snapshot()
                .combatObjects.filter((object) => object.factoryId === "graft-anchor" && object.state === "active");
              if (anchors.length === 3) return { ok: true, tick, anchors };
            }
            return { ok: false, observation: environment.observe(), environment: environment.environment().snapshot() };
          });
          assert.equal(phaseTwo.ok, true, JSON.stringify(phaseTwo));
          const snapshot = await page.evaluate(() =>
            window.__A2_CAPTURE_ENV__.captureSnapshot("in4-graft-intact", "reconstructed-reachable"),
          );
          await readParticleBoundary("original-before-capture");
          const original = await capture(`response-${profile}-graft-intact`, cleanPlayable, {
            profile,
            mechanic: "graft-anchor",
          });
          await readParticleBoundary("original-after-capture");
          if (responseImmediateRestore || responseSequence === "rollback-only") {
            const readContext = () =>
              page.evaluate(() => {
                const context = document.getElementById("game").getContext("2d");
                const transform = context.getTransform();
                return {
                  attributes: context.getContextAttributes(),
                  globalAlpha: context.globalAlpha,
                  globalCompositeOperation: context.globalCompositeOperation,
                  filter: context.filter,
                  shadowBlur: context.shadowBlur,
                  shadowColor: context.shadowColor,
                  shadowOffsetX: context.shadowOffsetX,
                  shadowOffsetY: context.shadowOffsetY,
                  imageSmoothingEnabled: context.imageSmoothingEnabled,
                  imageSmoothingQuality: context.imageSmoothingQuality,
                  transform: [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
                };
              });
            const beforeContext = await readContext();
            let rollback = null;
            if (responseSequence === "rollback-only") {
              const failedRestore = await page.evaluate((snapshot) => {
                const invalid = structuredClone(snapshot);
                invalid.state["tear.ui.v1"].screen = "invalid-state-forge-screen";
                return window.__A2_CAPTURE_ENV__.restoreSnapshot(invalid);
              }, snapshot);
              assert.equal(failedRestore.ok, false);
              assert.equal(failedRestore.rolledBack, true);
              const frame = await capture(`response-${profile}-graft-rollback-only`, cleanPlayable, { profile });
              rollback = {
                failedRestore,
                exactHash: frame.exactHash,
                imageHash: sha256(pngBuffer(frame.image)),
                context: await readContext(),
              };
            }
            const restore = await page.evaluate(
              (snapshot) => window.__A2_CAPTURE_ENV__.restoreSnapshot(snapshot),
              snapshot,
            );
            assert.equal(restore.ok, true, JSON.stringify(restore));
            const afterRestoreContext = await readContext();
            const restored = await capture(`response-${profile}-graft-immediate-restored`, cleanPlayable, { profile });
            const afterCaptureContext = await readContext();
            fs.writeFileSync(
              path.join(phaseDirectory, `immediate-restore-${profile}-diagnostic.json`),
              `${JSON.stringify(
                {
                  build: buildInfo,
                  profile,
                  responseSequence,
                  rollback,
                  requestedSettings: settings,
                  actualSettings,
                  beforeContext,
                  afterRestoreContext,
                  afterCaptureContext,
                  restore,
                  originalExactHash: original.exactHash,
                  restoredExactHash: restored.exactHash,
                  originalTick: original.observation.tick,
                  restoredTick: restored.observation.tick,
                  originalImageHash: sha256(pngBuffer(original.image)),
                  restoredImageHash: sha256(pngBuffer(restored.image)),
                  certifying: false,
                  limitation:
                    responseSequence === "rollback-only"
                      ? "Invalid-restore rollback then same-state restore only; no preceding damage, cleanup or fixed-state render loop"
                      : "Immediate same-state restore only; no intervening damage, cleanup, rollback or fixed-state render loop",
                },
                null,
                2,
              )}\n`,
            );
            if (rollback) {
              assert.equal(rollback.exactHash, original.exactHash);
              assert.equal(
                rollback.imageHash,
                sha256(pngBuffer(original.image)),
                "Rollback-only Graft pixels must match",
              );
            }
            assert.equal(restored.exactHash, original.exactHash);
            assert.equal(restored.observation.tick, original.observation.tick);
            assert.equal(
              sha256(pngBuffer(restored.image)),
              sha256(pngBuffer(original.image)),
              "Immediate restored Graft pixels must match",
            );
            continue;
          }
          const frozenSamples = [];
          if (responseFrozenControl) {
            for (let index = 0; index < 6; index += 1) {
              const frozen = await capture(`response-${profile}-graft-no-restore-${index}`, cleanPlayable, {
                profile,
                experiment: "same-state native rendering without restore",
                index,
              });
              assert.equal(frozen.exactHash, original.exactHash, "Frozen control must not change state");
              assert.equal(frozen.observation.tick, original.observation.tick);
              frozenSamples.push({
                index,
                exactHash: frozen.exactHash,
                tick: frozen.observation.tick,
                imageHash: sha256(pngBuffer(frozen.image)),
                matchesOriginal: frozen.image === original.image,
              });
            }
            const contextAttributes = await page.evaluate(() =>
              document.getElementById("game").getContext("2d").getContextAttributes(),
            );
            fs.writeFileSync(
              path.join(phaseDirectory, `no-restore-${profile}-diagnostic.json`),
              `${JSON.stringify(
                {
                  build: buildInfo,
                  profile,
                  requestedSettings: settings,
                  actualSettings,
                  contextAttributes,
                  originalImageHash: sha256(pngBuffer(original.image)),
                  originalExactHash: original.exactHash,
                  samples: frozenSamples,
                  certifying: false,
                  limitation: "Repeated rendering can perturb the native raster path; a pass is not restore acceptance",
                },
                null,
                2,
              )}\n`,
            );
          }
          const graft = original.environmentState.combatObjects.find(
            (object) => object.factoryId === "graft-anchor" && object.state === "active",
          );
          assert.ok(graft && graft.integrity > 0);
          const receipts = [];
          for (const [label, damage] of [
            ["damaged", graft.integrity / 2],
            ["destroyed", graft.integrity],
          ]) {
            const receipt = await page.evaluate(
              ({ id, damage, label }) => {
                const environment = window.__A2_CAPTURE_ENV__;
                const result = environment
                  .environment()
                  .damageCombatObject(id, damage, `in4-graft-fixture-${label}`, environment.observe().tick + 1);
                environment.step([]);
                return result;
              },
              { id: graft.id, damage, label },
            );
            assert.equal(receipt.accepted, true, JSON.stringify(receipt));
            assert.equal(receipt.destroyed, label === "destroyed");
            receipts.push(receipt);
            await capture(`response-${profile}-graft-${label}`, cleanPlayable, {
              profile,
              mechanic: "graft-anchor",
              stimulus: "test-only environment damage port",
            });
          }
          await page.evaluate((id) => {
            const environment = window.__A2_CAPTURE_ENV__;
            environment.environment().cleanupCombatObject(id, "boss-terminal", environment.observe().tick);
            environment.step([]);
          }, graft.id);
          const cleaned = await capture(`response-${profile}-graft-cleaned`, cleanPlayable, { profile });
          const terminal = cleaned.environmentState.combatObjects.find((object) => object.id === graft.id);
          assert.equal(terminal?.state, "expired");
          assert.equal(terminal?.cleanupReason, "boss-terminal");
          assert.equal(cleaned.observation.run.score, original.observation.run.score);
          let failedRestore = null;
          const rejectionOrigin = await page.evaluate(() =>
            window.__A2_CAPTURE_ENV__.captureSnapshot("in4-rejection-origin", "reconstructed-reachable"),
          );
          await readParticleBoundary("rejection-before-restore");
          if (responseSequence !== "damage-only") {
            failedRestore = await page.evaluate((snapshot) => {
              const invalid = structuredClone(snapshot);
              invalid.state["tear.ui.v1"].screen = "invalid-state-forge-screen";
              return window.__A2_CAPTURE_ENV__.restoreSnapshot(invalid);
            }, snapshot);
            const rejectionResult = await page.evaluate(() =>
              window.__A2_CAPTURE_ENV__.captureSnapshot("in4-rejection-result", "reconstructed-reachable"),
            );
            await readParticleBoundary("rejection-after-restore");
            const rolledBack = await capture(`response-${profile}-graft-rejected`, cleanPlayable, {
              profile,
              restorePhase: failedRestore.phase,
              rolledBack: failedRestore.rolledBack,
            });
            await readParticleBoundary("rejection-after-capture");
            const rejectionAfterCapture = await page.evaluate(() =>
              window.__A2_CAPTURE_ENV__.captureSnapshot("in4-rejection-after-capture", "reconstructed-reachable"),
            );
            fs.writeFileSync(
              path.join(phaseDirectory, `rejection-${profile}-diagnostic.json`),
              `${JSON.stringify(
                {
                  build: buildInfo,
                  profile,
                  responseSequence,
                  failedRestore,
                  requestedSettings: settings,
                  actualSettings,
                  before: rejectionOrigin,
                  after: rejectionResult,
                  afterCapture: rejectionAfterCapture,
                  fullStateEqual: isDeepStrictEqual(rejectionOrigin.state, rejectionResult.state),
                  captureStateEqual: isDeepStrictEqual(rejectionResult.state, rejectionAfterCapture.state),
                  beforeImageSHA256: sha256(pngBuffer(cleaned.image)),
                  afterImageSHA256: sha256(pngBuffer(rolledBack.image)),
                  exactPNGEqual: pngBuffer(cleaned.image).equals(pngBuffer(rolledBack.image)),
                  certifying: false,
                },
                null,
                2,
              )}\n`,
            );
            assert.equal(failedRestore.ok, false);
            assert.deepEqual(
              rejectionResult.state,
              rejectionOrigin.state,
              "Rejected restore must preserve the entire existing world",
            );
            assert.deepEqual(
              rejectionAfterCapture.state,
              rejectionResult.state,
              "Observation capture must preserve full snapshot state",
            );
            assert.equal(rolledBack.exactHash, cleaned.exactHash);
            assertPNGEqual(rolledBack.image, cleaned.image, "Rejected restore PNG bytes must match exactly");
          }
          await readParticleBoundary("positive-before-restore");
          const restore = await page.evaluate(
            (snapshot) => window.__A2_CAPTURE_ENV__.restoreSnapshot(snapshot),
            snapshot,
          );
          await readParticleBoundary("positive-after-restore-before-capture");
          const restored = await capture(`response-${profile}-graft-restored`, cleanPlayable, { profile });
          await readParticleBoundary("positive-after-capture");
          const restoredSnapshot = await page.evaluate(() =>
            window.__A2_CAPTURE_ENV__.captureSnapshot("in4-graft-restored", "reconstructed-reachable"),
          );
          const contextAttributes = await page.evaluate(() => ({
            userAgent: navigator.userAgent,
            context: document.getElementById("game").getContext("2d").getContextAttributes(),
          }));
          fs.writeFileSync(
            path.join(phaseDirectory, `restore-${profile}-diagnostic.json`),
            `${JSON.stringify(
              {
                build: buildInfo,
                profile,
                responseSequence,
                failedRestore,
                requestedSettings: settings,
                actualSettings,
                snapshot,
                restoredSnapshot,
                restore,
                rejectionOrigin,
                contextAttributes,
                frozenSamples,
                fullStateEqual: isDeepStrictEqual(snapshot.state, restoredSnapshot.state),
                nativeUninstrumented: !responseDrawTrace && !responseFrozenControl && !responseImmediateRestore,
                originalImageHash: sha256(pngBuffer(original.image)),
                restoredImageHash: sha256(pngBuffer(restored.image)),
                ...(responseDrawTrace
                  ? {
                      drawTrace: {
                        original: original.drawTrace,
                        restored: restored.drawTrace,
                        certifying: false,
                        limitation:
                          "Observational fillRect wrapper can perturb timing; native pixel assertions remain required",
                      },
                    }
                  : {}),
              },
              null,
              2,
            )}\n`,
          );
          assert.equal(restore.ok, true, JSON.stringify(restore));
          assert.deepEqual(restoredSnapshot.state, snapshot.state, "Restored Graft full snapshot state must match");
          assert.equal(restored.exactHash, original.exactHash);
          assertPNGEqual(restored.image, original.image, "Restored Graft PNG bytes must match exactly");
          responses.push({ profile, bloomForge, graftForge, phaseTwo, receipts, failedRestore, restore });
        }
        fs.writeFileSync(
          path.join(phaseDirectory, "manifest.json"),
          `${JSON.stringify(
            {
              format:
                responseSequence !== "full"
                  ? "tear-image-native-IN4-sequence-control"
                  : responseImmediateRestore
                    ? "tear-image-native-IN4-immediate-restore"
                    : "tear-image-native-IN4-responses",
              responseSequence,
              build: buildInfo,
              frames: captures,
              responses,
              resourceReport,
              observationClass: "A",
              certifying: false,
              limitations:
                responseSequence !== "full"
                  ? [`Class A ${responseSequence} control only; not full response/recovery acceptance`]
                  : responseImmediateRestore
                    ? [
                        "Class A immediate same-state restore only; no Graft damage, cleanup, rollback or recovery acceptance",
                      ]
                    : [
                        "Class A canonical forged states; Graft stimuli use the test-only environment damage port, not physical blade input",
                        "Not dense combat or full boss retry acceptance",
                      ],
            },
            null,
            2,
          )}\n`,
        );
        return;
      }
      if (imageNativeCoverage) {
        assert.equal(imageNativeControl, false, "Coverage requires the real IN3 package");
        if (imageNativeLiving)
          await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("live"));
        const coverage = [];
        const cameraOrigin = await page.evaluate(() =>
          window.__A2_CAPTURE_ENV__.captureSnapshot("camera-sweep-origin", "reconstructed-reachable"),
        );
        const profiles = [
          ["neutral", 1600, 900],
          ["wide", 2048, 1024],
          ["tall", 1200, 900],
          ["touch-landscape", 896, 414],
          ["ultrawide", 2560, 1080],
        ];
        if (imageNativeExtendedCoverage)
          profiles.push(
            ["square", 900, 900],
            ["portrait", 390, 844],
            ["canonical-laptop", 2048, 1041],
            ["canonical-hidpi", 1024, 768],
            ["canonical-mobile", 800, 360],
          );
        for (const [name, width, height] of profiles) {
          const restored = await page.evaluate(
            (snapshot) => window.__A2_CAPTURE_ENV__.restoreSnapshot(snapshot),
            cameraOrigin,
          );
          assert.equal(restored.ok, true, "Each viewport starts from the same captured world");
          await page.setViewportSize({ width, height });
          await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          for (let sample = 0; sample < (imageNativeCameraSweep ? 40 : 1); sample += 1) {
            const result = await page.evaluate(
              ({ policy, sample, sweep }) => {
                const environment = window.__A2_CAPTURE_ENV__;
                if (sweep) {
                  if (sample < 10)
                    environment.setCameraEffectsForTest({ zoom: sample < 5 ? 1 : 1.14, shake: sample === 0 ? 0 : 33 });
                  else environment.advanceApplicationFrame(1 / 30);
                }
                const canvas = document.querySelector("#game");
                const context = canvas.getContext("2d");
                const mask = document.createElement("canvas");
                mask.width = canvas.width;
                mask.height = canvas.height;
                const maskContext = mask.getContext("2d");
                const drawImage = context.drawImage;
                const supportDraws = [];
                const observedSupport = new Set();
                const before = environment.captureSnapshot("coverage-before", "reconstructed-reachable").hashes.exact;
                // Test-only interception: reuse loaded opaque support pixels, exact draw arguments,
                // smoothing and CTM. Do not count platform/floor fallback as prepared scene art.
                context.drawImage = function (source, ...args) {
                  if (
                    source instanceof ImageBitmap &&
                    args.length === 4 &&
                    !observedSupport.has(source) &&
                    ((source.width === 1672 && (source.height === 471 || source.height === 470)) ||
                      (source.width === 305 && source.height === 352) ||
                      (source.width === 96 && source.height === 236))
                  ) {
                    // Count only the first full opaque backing draw, not cropped
                    // water reuse or subsequent clipped foreground redraws.
                    observedSupport.add(source);
                    const matrix = this.getTransform();
                    maskContext.setTransform(matrix);
                    maskContext.imageSmoothingEnabled = this.imageSmoothingEnabled;
                    maskContext.imageSmoothingQuality = this.imageSmoothingQuality;
                    maskContext.drawImage(source, ...args);
                    supportDraws.push({
                      source: [source.width, source.height],
                      args,
                      transform: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
                    });
                  }
                  return drawImage.call(this, source, ...args);
                };
                let beauty;
                try {
                  beauty = environment.screenshot(policy);
                } finally {
                  delete context.drawImage;
                }
                const after = environment.captureSnapshot("coverage-after", "reconstructed-reachable").hashes.exact;
                const pixels = maskContext.getImageData(0, 0, mask.width, mask.height);
                let invalidPixels = 0,
                  partialPixels = 0;
                for (let index = 0; index < pixels.data.length; index += 4) {
                  const alpha = pixels.data[index + 3];
                  if (alpha < 255) invalidPixels += 1;
                  if (alpha > 0 && alpha < 255) partialPixels += 1;
                  pixels.data[index] = 255;
                  pixels.data[index + 1] = alpha === 255 ? 255 : 0;
                  pixels.data[index + 2] = 255;
                  pixels.data[index + 3] = 255;
                }
                maskContext.putImageData(pixels, 0, 0);
                return {
                  beauty,
                  mask: mask.toDataURL("image/png"),
                  invalidPixels,
                  partialPixels,
                  pixelCount: mask.width * mask.height,
                  backing: [mask.width, mask.height],
                  supportDraws,
                  before,
                  after,
                  viewport: window.__TEAR_CATALOG_DEBUG__.viewport.snapshot(),
                };
              },
              { policy: cleanEnvironment, sample, sweep: imageNativeCameraSweep },
            );
            assert.equal(result.before, result.after, "Coverage diagnostics must not mutate gameplay");
            assert.equal(
              result.supportDraws.length,
              8,
              "Coverage must observe all eight real support draws exactly once",
            );
            const { beauty, mask, ...receipt } = result;
            const captureName = imageNativeCameraSweep
              ? `camera-${String(coverage.length).padStart(3, "0")}`
              : `coverage-${name}`;
            fs.writeFileSync(path.join(phaseDirectory, `${captureName}-beauty.png`), pngBuffer(beauty));
            if (!imageNativeCameraSweep || sample === 0 || receipt.invalidPixels > 0) {
              fs.writeFileSync(path.join(phaseDirectory, `${captureName}-invalid.png`), pngBuffer(mask));
            }
            coverage.push({
              name,
              sample,
              cameraPolicy: !imageNativeCameraSweep
                ? "neutral"
                : sample < 10
                  ? "audited-extrema-fixture"
                  : "production-frame-settling",
              ...receipt,
            });
          }
        }
        const restored = await page.evaluate(
          (snapshot) => window.__A2_CAPTURE_ENV__.restoreSnapshot(snapshot),
          cameraOrigin,
        );
        assert.equal(restored.ok, true, "Camera sweep must restore the captured world");
        fs.writeFileSync(
          path.join(phaseDirectory, "coverage.json"),
          `${JSON.stringify(
            {
              format: imageNativeLiving
                ? "tear-living-stage-camera-coverage"
                : "tear-image-native-IN3-coverage-baseline",
              build: buildInfo,
              resourceReport,
              coverage,
              certifying: false,
              verdict: coverage.some((entry) => entry.invalidPixels > 0)
                ? "unsupported-envelope"
                : "sampled-coverage-only",
              method:
                "Replay the actual opaque support bitmap draws with their live viewport/world CTM into a transparent diagnostic canvas; every alpha below 255 is invalid, including sampling seams.",
              limitations: [
                imageNativeCameraSweep
                  ? "Class A audited extrema fixtures plus production settling; not a full boss/replay/attract journey or arbitrary-aspect guarantee"
                  : "Static wave-31 camera only; shake, zoom transitions and other consumers remain separate required sweeps",
                "Support draw clip is the full canvas in this package; future local clipping requires corresponding mask support",
                "Magenta marks missing prepared image coverage, even where gameplay floor later occludes it",
              ],
            },
            null,
            2,
          )}\n`,
        );
        assert.ok(
          coverage.every((entry) => entry.invalidPixels === 0),
          "IN3 sampled profiles must have complete prepared-image support",
        );
        return;
      }
      const origin = await capture("verdant-image-native-beauty", cleanPlayable);
      const neutral = await capture("verdant-image-native-neutral-environment", cleanEnvironment, {
        view: "composite",
      });
      if (!imageNativeControl) {
        for (const view of ["support-only", "tail-only"]) {
          await page.evaluate((view) => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setView(view), view);
          const frame = await capture(`verdant-image-native-${view}`, cleanEnvironment, { view });
          assert.equal(frame.exactHash, neutral.exactHash, "Layer diagnostics must not mutate gameplay");
        }
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setView("composite"));
        const restored = await capture("verdant-image-native-neutral-restored", cleanEnvironment, {
          view: "composite",
        });
        assertPNGEqual(restored.image, neutral.image, "Restoring composite must reproduce the same runtime pixels");
        assert.deepEqual(
          await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.report()),
          resourceReport,
          "Diagnostics must not reload or change resources",
        );
      }
      const geometry = (platforms) => platforms.map(({ x, y, w, h }) => ({ x, y, w, h }));
      const platformIndex = origin.platforms.findIndex((platform) => platform.y < 800);
      assert.ok(platformIndex >= 0);
      for (const state of ["stable", "stressed", "warning", "broken", "reforming", "stable"]) {
        await page.evaluate(({ index, state }) => window.__PANTHEON_TEST.setCalibrationPlatformState(index, state), {
          index: platformIndex,
          state,
        });
        const frame = await capture(`platform-${captures.length}-${state}`, cleanPlayable, {
          purpose: "test-fixture state through real platform renderer; not autonomous lifecycle simulation",
          state,
        });
        assert.deepEqual(
          geometry(frame.platforms),
          geometry(origin.platforms),
          "Fixture must preserve collision geometry",
        );
      }
      await materializeVerdant();
      await page.evaluate(() => window.__PANTHEON_TEST.prepareCalibrationMovement());
      if (imageNativeMotion)
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("live"));
      const movement = [];
      for (let frame = 0; frame < 90; frame += 1) {
        const sample = await page.evaluate((frame) => {
          const environment = window.__A2_CAPTURE_ENV__;
          const tick = environment.observe().tick + 1;
          const commands =
            frame === 0 || frame === 45
              ? [
                  { type: "move", x: frame === 0 ? 1000 : -1000, y: 0 },
                  { type: "jump", phase: "pressed" },
                ]
              : [];
          environment.renderFrame(
            1 / 30,
            commands.map((command, index) => ({ kind: "command", tick, id: frame * 4 + index + 1, command })),
          );
          return {
            image: environment.screenshot({
              ui: "include",
              debug: "exclude",
              pointerLock: "exclude",
              actors: "include",
            }),
            observation: environment.observe(),
          };
        }, frame);
        fs.writeFileSync(
          path.join(phaseDirectory, `movement-${String(frame).padStart(3, "0")}.png`),
          pngBuffer(sample.image),
        );
        movement.push({ frame, tick: sample.observation.tick, player: sample.observation.player });
      }
      assert.notEqual(movement[0].player.x, movement[44].player.x, "Real simulation must move the player");
      assert.ok(
        movement[89].tick - movement[0].tick >= 350,
        "Movement clip must contain three seconds of advancing simulation",
      );
      assert.ok(movement[89].player.x < movement[44].player.x, "Movement must reverse through semantic input");
      if (imageNativeMotion) {
        await page.evaluate(() => window.__A2_CAPTURE_ENV__.setCameraEffectsForTest({ zoom: 1, shake: 0 }));
        let neutralMotion;
        for (const motion of ["neutral", "minimum", "maximum", "neutral"]) {
          await page.evaluate((value) => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion(value), motion);
          const frame = await capture(
            `motion-${motion}${neutralMotion && motion === "neutral" ? "-restored" : ""}`,
            cleanEnvironment,
            { motion },
          );
          if (!neutralMotion) neutralMotion = frame;
          else {
            assert.equal(frame.exactHash, neutralMotion.exactHash, "Decorative extrema cannot mutate gameplay");
            if (motion === "neutral")
              assertPNGEqual(frame.image, neutralMotion.image, "Neutral pose must restore exact runtime pixels");
          }
        }
        await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.verdantCalibration.setMotion("live"));
        const liveOrigin = await capture("motion-live-origin", cleanEnvironment, { motion: "live" });
        const motionSnapshot = await page.evaluate(() =>
          window.__A2_CAPTURE_ENV__.captureSnapshot("motion-clock-origin", "reconstructed-reachable"),
        );
        await page.evaluate(() => {
          for (let step = 0; step < 15; step += 1) window.__A2_CAPTURE_ENV__.advanceApplicationFrame(1 / 30);
        });
        const advanced = await capture("motion-live-advanced", cleanEnvironment, { motion: "live" });
        const failedRestore = await page.evaluate((snapshot) => {
          const hostile = structuredClone(snapshot);
          hostile.state["tear.ui.v1"].screen = "invalid-state-forge-screen";
          return window.__A2_CAPTURE_ENV__.restoreSnapshot(hostile);
        }, motionSnapshot);
        assert.equal(failedRestore.ok, false, "Hostile restore must fail");
        assert.ok(
          ["validate", "stage", "commit"].includes(failedRestore.phase),
          "Hostile restore must report its rejection phase",
        );
        const rolledBack = await capture("motion-live-rollback", cleanEnvironment, { motion: "live" });
        assert.equal(rolledBack.exactHash, advanced.exactHash, "Rollback must preserve the advanced world and clock");
        assert.equal(
          sha256(pngBuffer(rolledBack.image)),
          sha256(pngBuffer(advanced.image)),
          "Rollback must restore exact live motion pixels",
        );
        const restoration = await page.evaluate(
          (snapshot) => window.__A2_CAPTURE_ENV__.restoreSnapshot(snapshot),
          motionSnapshot,
        );
        assert.equal(restoration.ok, true, "Live motion snapshot must restore");
        const liveRestored = await capture("motion-live-restored", cleanEnvironment, { motion: "live" });
        assert.equal(liveRestored.exactHash, liveOrigin.exactHash, "Motion restore must preserve gameplay state");
        assert.equal(
          sha256(pngBuffer(liveRestored.image)),
          sha256(pngBuffer(liveOrigin.image)),
          "Live motion must derive the same pixels from restored time",
        );
      }
      fs.writeFileSync(
        path.join(phaseDirectory, "manifest.json"),
        `${JSON.stringify(
          {
            format: imageNativeControl ? "tear-image-native-IN1-control" : "tear-image-native-IN3-overscan",
            build: buildInfo,
            frames: captures,
            movement,
            resourceReport,
            approvedAsset: { sha256: "0c332d1b114af9ad88435896fa52af6a75fe2cfbf2cb0256d953a1bc96fbffcd" },
            certifying: false,
            coverageCertified: false,
            limitations: [
              imageNativeControl
                ? "Single calibration control plate"
                : "IN3 prepared support and bounded local motion; full consumer/release matrix not certified",
              "Platform states explicitly set by test fixture",
              "Movement fixture parks/stuns enemies to isolate locomotion; does not prove combat",
            ],
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    throw new Error("Select the explicit image-native scene fixture");
  },
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
