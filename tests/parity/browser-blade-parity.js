const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const fixtureArgument = process.argv.find((argument) => argument.startsWith("--fixture="));
const FIXTURE_FILE = fixtureArgument
  ? path.resolve(REPOSITORY_ROOT, fixtureArgument.slice("--fixture=".length))
  : path.join(__dirname, "blade-pointer-lifecycle.json");
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, "artifacts", "parity");
const ORACLE_REVISION = "ee5e93141d67cc02505b2227b3be0b10d1819e1c";
const ORACLE_PROBE = `
  window.__TEAR_ORACLE_PARITY__ = Object.freeze({
    startRun: (mode, difficulty) => { startRun(mode, difficulty); },
    prepareEnemyParityScenario: () => {
      player.x = W / 2; player.y = CONFIG.world.groundY - player.hh;
      player.vx = 0; player.vy = 0; player.onGround = true;
      const enemy = new Charger(W / 2 + 300, CONFIG.world.groundY - CONFIG.enemy.h / 2);
      Object.assign(enemy, {
        vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 0, hitCd: 0, aliveT: 0,
        behavior: "bull", atk: "windup", atkT: 0.3, atkMax: 0.3, atkDir: -1,
        atkCd: 0, chargePower: 0.5, chargeMult: 1, canClimb: false, climber: false,
        variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      enemies = [enemy]; projectiles = [];
    },
    prepareRangedParityScenario: () => {
      Object.assign(player, { x: 450, y: CONFIG.world.groundY - player.hh,
        vx: 0, vy: 0, onGround: true });
      const enemy = new Ranged(1150, CONFIG.world.groundY - CONFIG.ranged.h / 2);
      Object.assign(enemy, {
        vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 0, hitCd: 0, aliveT: 0,
        behavior: "", state: "kite", aimTimer: 0.05, windT: 0, windMax: 0,
        fireRateMult: 1, auraHaste: 1, auraDmg: 1, volley: 1,
        canClimb: false, climber: false, variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      enemies = [enemy]; projectiles = [];
    },
    prepareProjectileParryScenario: () => {
      const owner = new Ranged(1500, CONFIG.world.groundY - CONFIG.ranged.h / 2);
      Object.assign(owner, {
        vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 9, hitCd: 0, aliveT: 0,
        behavior: "", state: "kite", aimTimer: 9, windT: 0, windMax: 0,
        canClimb: false, climber: false, variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      const actualTipX = blade.tipX, actualTipY = blade.tipY;
      const shot = new Projectile(blade.x + (actualTipX - blade.x) * 0.62,
        blade.y + (actualTipY - blade.y) * 0.62, -800, 0);
      shot.r = 18; shot.owner = owner; shot.sourceEnemy = owner; shot.dmg = CONFIG.proj.dmg;
      Object.assign(blade, { state: "held", vx: 0, vy: 0,
        tipX: actualTipX - 28, tipY: actualTipY, prevTipX: actualTipX - 28, prevTipY: actualTipY });
      run.mods.parryGuard = true; run.weaponStats.perfectParries = 0; player.guardT = 0;
      enemies = [owner]; projectiles = [shot];
    },
    prepareMirrorPursuitScenario: () => {
      Object.assign(player, { x: 350, y: CONFIG.world.groundY - player.hh,
        vx: 0, vy: 0, onGround: true, lastTrickT: 0, lastTrickKind: "" });
      Mirror.active = false; Mirror.host = null; Mirror.fxq.length = 0;
      const host = new MirrorHost(1200, CONFIG.world.groundY - CONFIG.echo.h / 2, run.mods);
      Object.assign(host, {
        _live: true, vx: 0, vy: 0, onGround: true, spawnT: 0, introT: 0,
        stun: 0, hitCd: 0, aliveT: 0, variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      enemies = [host]; projectiles = [];
    },
    prepareCombatParityScenario: () => {
      const dx = blade.tipX - blade.x, dy = blade.tipY - blade.y;
      const survivor = new Charger(blade.x + dx * 0.48, blade.y + dy * 0.48);
      const victim = new Charger(blade.x + dx * 0.78, blade.y + dy * 0.78);
      for (const enemy of [survivor, victim]) Object.assign(enemy, {
        vx: 0, vy: 0, onGround: false, spawnT: 0, stun: 0.75, hitCd: 0, aliveT: 0,
        behavior: "bull", atk: "idle", atkT: 0, atkCd: 9, canClimb: false, climber: false,
        variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      victim.hp = 1; victim.hpDisplay = 1;
      Object.assign(blade, { state: "held", vx: 1800, vy: 0 });
      enemies = [survivor, victim]; projectiles = [];
    },
    screen: () => state,
    snapshot: () => {
      const hint = document.querySelector("#lockhint");
      return {
        screen: state,
        simulationTick: Math.round(CLOCK.sim * 120),
        runTime: run?.runTime ?? null,
        input: {
          mode: Input.mode,
          pointerLocked: Input.locked,
          pointerLockAllowed: Input.allowLock,
          pointer: { x: Input.mouseX, y: Input.mouseY },
          tetherHeld: Input.tetherHeld,
        },
        cursor: {
          bodyMode: document.body.dataset.imode ?? null,
          canvas: getComputedStyle(canvas).cursor,
          drawn: state !== "playing" && Input.mode === "mouse",
          lockHintVisible: hint ? getComputedStyle(hint).display !== "none" : false,
        },
        player: player ? {
          x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp,
          onGround: player.onGround, coyote: player.coyote, jumpBuffer: player.jumpBuf,
          dashTimer: player.dashTimer, dashCooldown: player.dashCd,
          guardTime: player.guardT,
        } : null,
        blade: blade ? {
          state: blade.state, x: blade.x, y: blade.y, vx: blade.vx, vy: blade.vy,
          tipX: blade.tipX, tipY: blade.tipY, tipVX: blade.tipVX, tipVY: blade.tipVY,
          aimX: blade.aimX, aimY: blade.aimY, reticleX: blade.reticleX, reticleY: blade.reticleY,
          flyTime: blade.flyTime, tension: blade.tension, secondaryActive: blade.secondaryActive,
        } : null,
        enemies: enemies.filter((enemy) => !enemy.dead).slice(0, 24).map((enemy) => ({
          kind: enemy.kind, bossId: enemy.bossId, x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy,
          hp: enemy.hp, stun: enemy.stun, spawnT: enemy.spawnT, introT: enemy.introT || 0, aliveT: enemy.aliveT,
          onGround: enemy.onGround, behavior: enemy.behavior, attack: enemy.atk, attackTime: enemy.atkT,
          attackCooldown: enemy.atkCd, attackDirection: enemy.atkDir, chargePower: enemy.chargePower,
          maxHp: enemy.maxHp, hitCooldown: enemy.hitCd, dying: enemy.dying,
          aiState: enemy.state, aimTimer: enemy.aimTimer,
          windTime: enemy.windT, windMax: enemy.windMax,
        })),
        projectiles: projectiles.filter((projectile) => !projectile.dead).slice(0, 24).map((projectile) => ({
          x: projectile.x, y: projectile.y, vx: projectile.vx, vy: projectile.vy, r: projectile.r,
          life: projectile.life, damage: projectile.dmg, deflectDamage: projectile.deflectDmg,
          family: projectile.family,
          kind: projectile.kind, deflected: projectile.deflected, perfect: projectile.perfect,
          charged: projectile.charged, dead: projectile.dead,
        })),
        mirror: Mirror.active ? {
          active: Mirror.active, attached: Mirror.host === enemies[0],
          phase: Mirror.phase, sync: Mirror.sync, state: Mirror._state,
          stateTime: Mirror._stateT, decisionTime: Mirror._decideT,
          moveCooldown: Mirror._moveCd, move: Mirror.mv ? Mirror.mv.id : null,
          facing: Mirror.facing, readDistance: Mirror.read.dist,
          actor: {
            x: Mirror.actor.x, y: Mirror.actor.y, vx: Mirror.actor.vx, vy: Mirror.actor.vy,
            onGround: Mirror.actor.onGround, dashTimer: Mirror.actor.dashTimer,
          },
          blade: {
            state: Mirror.blade.state, x: Mirror.blade.x, y: Mirror.blade.y,
            tipX: Mirror.blade.tipX, tipY: Mirror.blade.tipY,
            tipVX: Mirror.blade.tipVX, tipVY: Mirror.blade.tipVY,
          },
        } : null,
        combat: run ? { enemyCount: enemies.filter((enemy) => !enemy.dead).length,
          waveKills: run.waveKills, heldHits: run.weaponStats.heldHits,
          perfectParries: run.weaponStats.perfectParries } : null,
      };
    },
  });
`;

function contentType(file) {
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript";
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".mp3")) return "audio/mpeg";
  if (file.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

function createStaticServer(root, port) {
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  return {
    baseUrl,
    listen: () => new Promise((resolve) => server.listen(port, "127.0.0.1", resolve)),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function installAdapter(page, kind, fixture) {
  if (kind === "oracle") {
    await page.evaluate(({ mode, difficulty, revision }) => {
      window.__TEAR_PARITY_ADAPTER__ = Object.freeze({
        source: { kind: "oracle", revision },
        startRun: () => window.__TEAR_ORACLE_PARITY__.startRun(mode, difficulty),
        prepareEnemyParityScenario: () => window.__TEAR_ORACLE_PARITY__.prepareEnemyParityScenario(),
        prepareRangedParityScenario: () => window.__TEAR_ORACLE_PARITY__.prepareRangedParityScenario(),
        prepareProjectileParryScenario: () => window.__TEAR_ORACLE_PARITY__.prepareProjectileParryScenario(),
        prepareMirrorPursuitScenario: () => window.__TEAR_ORACLE_PARITY__.prepareMirrorPursuitScenario(),
        prepareCombatParityScenario: () => window.__TEAR_ORACLE_PARITY__.prepareCombatParityScenario(),
        screen: () => window.__TEAR_ORACLE_PARITY__.screen(),
        snapshot: () => window.__TEAR_ORACLE_PARITY__.snapshot(),
      });
    }, { mode: fixture.mode, difficulty: fixture.difficulty, revision: ORACLE_REVISION });
    return;
  }

  await page.evaluate(({ mode, difficulty }) => {
    window.__TEAR_PARITY_ADAPTER__ = Object.freeze({
      source: { kind: "current", revision: "working-tree" },
      startRun: () => window.__PANTHEON_TEST.startMode(mode, difficulty),
      prepareEnemyParityScenario: () => window.__PANTHEON_TEST.prepareEnemyParityScenario(),
      prepareRangedParityScenario: () => window.__PANTHEON_TEST.prepareRangedParityScenario(),
      prepareProjectileParryScenario: () => window.__PANTHEON_TEST.prepareProjectileParryScenario(),
      prepareMirrorPursuitScenario: () => window.__PANTHEON_TEST.prepareMirrorPursuitScenario(),
      prepareCombatParityScenario: () => window.__PANTHEON_TEST.prepareCombatParityScenario(),
      screen: () => window.__PANTHEON_TEST.state().game,
      snapshot: () => {
        const live = window.__PANTHEON_TEST.state();
        const input = window.__TEAR_CATALOG_DEBUG__.input.snapshot();
        const canvas = document.querySelector("canvas");
        const hint = document.querySelector("#lockhint");
        return {
          screen: live.game,
          simulationTick: live.simulationTick,
          runTime: live.runTime ?? null,
          input: {
            mode: input.mode,
            pointerLocked: input.pointerLocked,
            pointerLockAllowed: input.pointerLockAllowed,
            pointer: input.pointer,
            tetherHeld: Boolean(input.tetherHeld),
          },
          cursor: {
            bodyMode: document.body.dataset.imode ?? null,
            canvas: canvas ? getComputedStyle(canvas).cursor : null,
            drawn: live.game !== "playing" && input.mode === "mouse",
            lockHintVisible: hint ? getComputedStyle(hint).display !== "none" : false,
          },
          player: live.playerTrace,
          blade: live.bladeTrace,
          enemies: live.enemyTrace,
          projectiles: live.projectileTrace,
          mirror: live.mirrorTrace,
          combat: live.combatTrace,
        };
      },
    });
  }, { mode: fixture.mode, difficulty: fixture.difficulty });
}

async function settle(page, frames = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let remaining = count;
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), frames);
}

async function installTickBridge(page) {
  await page.evaluate(() => {
    const moveMouse = (x, y) => {
      const canvas = document.querySelector("canvas");
      const prior = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
      const event = new MouseEvent("mousemove", {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
      });
      Object.defineProperties(event, {
        movementX: { value: x - prior.x },
        movementY: { value: y - prior.y },
      });
      canvas.dispatchEvent(event);
      window.__TEAR_PARITY_MOUSE__ = { x, y };
    };
    const dispatch = (action) => {
      const canvas = document.querySelector("canvas");
      const point = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
      const buttonIndex = action.button === "right" ? 2 : 0;
      const dispatchKey = (type) => window.dispatchEvent(new KeyboardEvent(type, {
        key: action.key ?? action.code, code: action.code ?? action.key,
        bubbles: true, cancelable: true,
      }));
      if (action.type === "prepareEnemyScenario") {
        window.__TEAR_PARITY_ADAPTER__.prepareEnemyParityScenario();
      } else if (action.type === "prepareRangedScenario") {
        window.__TEAR_PARITY_ADAPTER__.prepareRangedParityScenario();
      } else if (action.type === "prepareProjectileParryScenario") {
        window.__TEAR_PARITY_ADAPTER__.prepareProjectileParryScenario();
      } else if (action.type === "prepareMirrorPursuitScenario") {
        window.__TEAR_PARITY_ADAPTER__.prepareMirrorPursuitScenario();
      } else if (action.type === "prepareCombatScenario") {
        window.__TEAR_PARITY_ADAPTER__.prepareCombatParityScenario();
      } else if (action.type === "mouseMove") {
        moveMouse(action.x, action.y);
      } else if (action.type === "mouseClick") {
        moveMouse(action.x, action.y);
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: action.x, clientY: action.y, button: buttonIndex,
        }));
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: action.x, clientY: action.y, button: buttonIndex,
        }));
        canvas.dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true, clientX: action.x, clientY: action.y, button: buttonIndex,
        }));
      } else if (action.type === "mouseDown") {
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: buttonIndex,
        }));
      } else if (action.type === "mouseUp") {
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: buttonIndex,
        }));
      } else if (action.type === "keyPress") {
        if (action.key === "Escape") void document.exitPointerLock();
        dispatchKey("keydown");
        dispatchKey("keyup");
      } else if (action.type === "keyDown") {
        dispatchKey("keydown");
      } else if (action.type === "keyUp") {
        dispatchKey("keyup");
      }
    };
    window.__TEAR_PARITY_TICK__ = {
      jobs: [],
      captures: {},
      events: [],
      before(tick) {
        for (const job of this.jobs) {
          if (!job.dispatched && job.action && job.actionTick === tick) {
            job.dispatched = true;
            dispatch(job.action);
            this.events.push({
              tick,
              action: job.action,
              input: window.__TEAR_PARITY_ADAPTER__.snapshot().input,
            });
          }
        }
      },
      after(tick) {
        for (const job of this.jobs) {
          if (!job.captured && job.captureTick === tick) {
            job.captured = true;
            this.captures[job.id] = window.__TEAR_PARITY_ADAPTER__.snapshot();
          }
        }
      },
    };
  });
}

async function queueTickJobs(page, jobs) {
  await page.evaluate((entries) => {
    window.__TEAR_PARITY_TICK__.jobs.push(...entries.map((job) => ({
      ...job,
      dispatched: job.action === null,
      captured: false,
    })));
  }, jobs);
}

async function readTickCapture(page, id) {
  try {
    await page.waitForFunction((captureId) => Boolean(window.__TEAR_PARITY_TICK__.captures[captureId]), id, {
      timeout: 10_000,
    });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      screen: window.__TEAR_PARITY_ADAPTER__.screen(),
      snapshot: window.__TEAR_PARITY_ADAPTER__.snapshot(),
      jobs: window.__TEAR_PARITY_TICK__.jobs,
      captureIds: Object.keys(window.__TEAR_PARITY_TICK__.captures),
    }));
    throw new Error(`${error.message}\nTick bridge diagnostics: ${JSON.stringify(diagnostics)}`);
  }
  return page.evaluate((captureId) => {
    const snapshot = window.__TEAR_PARITY_TICK__.captures[captureId];
    delete window.__TEAR_PARITY_TICK__.captures[captureId];
    window.__TEAR_PARITY_TICK__.jobs = window.__TEAR_PARITY_TICK__.jobs
      .filter((job) => job.id !== captureId);
    return snapshot;
  }, id);
}

async function applyAction(page, action) {
  switch (action.type) {
    case "wait":
      await page.waitForTimeout(action.ms);
      break;
    case "mouseMove":
      await page.evaluate(({ x, y }) => {
        const canvas = document.querySelector("canvas");
        const prior = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        const event = new MouseEvent("mousemove", {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
        });
        Object.defineProperties(event, {
          movementX: { value: x - prior.x },
          movementY: { value: y - prior.y },
        });
        canvas.dispatchEvent(event);
        window.__TEAR_PARITY_MOUSE__ = { x, y };
      }, action);
      break;
    case "mouseClick":
      await page.evaluate(({ x, y, button }) => {
        const canvas = document.querySelector("canvas");
        const prior = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        const buttonIndex = button === "right" ? 2 : 0;
        const move = new MouseEvent("mousemove", {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
        });
        Object.defineProperties(move, {
          movementX: { value: x - prior.x },
          movementY: { value: y - prior.y },
        });
        canvas.dispatchEvent(move);
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: buttonIndex,
        }));
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: buttonIndex,
        }));
        canvas.dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: buttonIndex,
        }));
        window.__TEAR_PARITY_MOUSE__ = { x, y };
      }, { ...action, button: action.button ?? "left" });
      break;
    case "mouseDown":
      await page.evaluate(({ button }) => {
        const canvas = document.querySelector("canvas");
        const point = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
          button: button === "right" ? 2 : 0,
        }));
      }, action);
      break;
    case "mouseUp":
      await page.evaluate(({ button }) => {
        const point = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
          button: button === "right" ? 2 : 0,
        }));
      }, action);
      break;
    case "keyPress":
      await page.evaluate((entry) => {
        const options = { key: entry.key ?? entry.code, code: entry.code ?? entry.key,
          bubbles: true, cancelable: true };
        window.dispatchEvent(new KeyboardEvent("keydown", options));
        window.dispatchEvent(new KeyboardEvent("keyup", options));
      }, action);
      break;
    case "keyDown":
    case "keyUp":
      await page.evaluate((entry) => {
        window.dispatchEvent(new KeyboardEvent(entry.type === "keyDown" ? "keydown" : "keyup", {
          key: entry.key ?? entry.code, code: entry.code ?? entry.key,
          bubbles: true, cancelable: true,
        }));
      }, action);
      break;
    case "waitForPause":
      try {
        await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "paused", undefined, {
          timeout: action.timeoutMs ?? 2000,
        });
      } catch (error) {
        if (error?.name !== "TimeoutError") throw error;
      }
      break;
    case "restartRun":
      await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.startRun());
      await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "playing");
      break;
    default:
      throw new Error(`Unknown parity action: ${String(action.type)}`);
  }
}

async function captureTrace(browser, kind, baseUrl, root, fixture) {
  const page = await browser.newPage({ viewport: fixture.viewport });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await page.route("**/*", async (route) => {
    if (kind === "oracle" && new URL(route.request().url()).pathname === "/js/game.js") {
      const gameFile = path.join(root, "js", "game.js");
      const source = fs.readFileSync(gameFile, "utf8").replace(/\r\n/g, "\n");
      const marker = "  requestAnimationFrame(frame);";
      assert.ok(source.lastIndexOf(marker) >= 0, "oracle game.js probe insertion marker is missing");
      const stepMarker = "  function stepPlaying(dt) {";
      const afterStepMarker = "\n  }\n\n  function onKill(e, cause) {";
      assert.ok(source.includes(stepMarker) && source.includes(afterStepMarker),
        "oracle fixed-step probe markers are missing");
      const instrumented = source
        .replace(stepMarker, `${stepMarker}\n    window.__TEAR_PARITY_TICK__?.before?.(Math.round(CLOCK.sim * 120) + 1);`)
        .replace(afterStepMarker,
          "\n    window.__TEAR_PARITY_TICK__?.after?.(Math.round(CLOCK.sim * 120));\n  }\n\n  function onKill(e, cause) {");
      const insertion = instrumented.lastIndexOf(marker);
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `${instrumented.slice(0, insertion)}${ORACLE_PROBE}\n${instrumented.slice(insertion)}`,
      });
      return;
    }
    if (route.request().url().startsWith(`${baseUrl}/`)) void route.continue();
    else void route.abort();
  });
  await page.addInitScript(() => {
    window.__TEAR_POINTER_EVENTS__ = [];
    document.addEventListener("pointerlockchange", () => {
      window.__TEAR_POINTER_EVENTS__.push({
        type: "pointerlockchange",
        atMs: performance.now(),
        locked: Boolean(document.pointerLockElement),
      });
    });
    document.addEventListener("pointerlockerror", () => {
      window.__TEAR_POINTER_EVENTS__.push({ type: "pointerlockerror", atMs: performance.now() });
    });
  });

  const query = kind === "current" ? "?test=1&bossdebug=1" : "?bossdebug=1";
  await page.goto(`${baseUrl}/${query}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (kind === "current") {
    await page.waitForFunction(() => window.__PANTHEON_TEST && window.__TEAR_CATALOG_DEBUG__, undefined, {
      timeout: 15_000,
    });
  } else {
    await page.waitForFunction(() => window.__TEAR_ORACLE_PARITY__, undefined, { timeout: 15_000 });
  }
  await installAdapter(page, kind, fixture);
  await installTickBridge(page);
  await page.mouse.click(10, 10);
  await settle(page);
  const escapeIndex = fixture.actions.findIndex((action) => action.type === "keyPress" && action.key === "Escape");
  const firstEscapeIndex = escapeIndex < 0 ? fixture.actions.length : escapeIndex;
  const planned = new Map();
  let plannedTick = 0;
  const firstRunJobs = [];
  for (let index = 0; index < firstEscapeIndex; index += 1) {
    const action = fixture.actions[index];
    const id = `${String(index)}-${action.checkpoint ?? action.type}`;
    if (action.type === "wait") {
      plannedTick += Math.max(1, Math.round(action.ms * 0.12));
      firstRunJobs.push({ id, captureTick: plannedTick, action: null, actionTick: null });
    } else {
      const actionTick = plannedTick + 1;
      plannedTick = actionTick + 12;
      firstRunJobs.push({ id, captureTick: plannedTick, action, actionTick });
    }
    planned.set(index, plannedTick);
  }
  await queueTickJobs(page, firstRunJobs);
  await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.startRun());
  await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "playing");

  const startedAt = Date.now();
  const checkpoints = [];
  let targetTick = 0;
  let postRestartQueued = false;
  for (let index = 0; index < fixture.actions.length; index += 1) {
    const action = fixture.actions[index];
    const captureId = `${String(index)}-${action.checkpoint ?? action.type}`;
    let snapshot;
    if (planned.has(index)) {
      targetTick = planned.get(index);
      snapshot = await readTickCapture(page, captureId);
    } else if (action.type === "wait") {
      targetTick += Math.max(1, Math.round(action.ms * 0.12));
      snapshot = await readTickCapture(page, captureId);
    } else if (action.type === "keyPress" && action.key === "Escape") {
      await applyAction(page, action);
      await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "paused", undefined, {
        timeout: 3_000,
      });
      snapshot = await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.snapshot());
      targetTick = snapshot.simulationTick;
    } else {
      if (action.type === "restartRun") {
        if (!postRestartQueued) {
          let restartTick = 0;
          const restartJobs = [];
          for (let future = index; future < fixture.actions.length; future += 1) {
            const futureAction = fixture.actions[future];
            const id = `${String(future)}-${futureAction.checkpoint ?? futureAction.type}`;
            if (futureAction.type === "restartRun") {
              restartTick = 30;
              restartJobs.push({ id, captureTick: restartTick, action: null, actionTick: null });
            } else if (futureAction.type === "wait") {
              restartTick += Math.max(1, Math.round(futureAction.ms * 0.12));
              restartJobs.push({ id, captureTick: restartTick, action: null, actionTick: null });
            }
            planned.set(future, restartTick);
          }
          await queueTickJobs(page, restartJobs);
          postRestartQueued = true;
        }
        await applyAction(page, action);
        targetTick = planned.get(index);
        snapshot = await readTickCapture(page, captureId);
      } else if (action.type === "waitForPause") {
        await applyAction(page, action);
        await settle(page);
        snapshot = await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.snapshot());
      } else if (await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.screen() === "playing")) {
        const actionTick = targetTick + 1;
        targetTick = actionTick + 12;
        await queueTickJobs(page, [{ id: captureId, captureTick: targetTick, action, actionTick }]);
        snapshot = await readTickCapture(page, captureId);
      } else {
        await applyAction(page, action);
        await settle(page);
        snapshot = await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.snapshot());
      }
    }
    checkpoints.push({
      index,
      label: action.checkpoint ?? `${String(index)}-${action.type}`,
      action: { ...action, checkpoint: undefined },
      atMs: Date.now() - startedAt,
      targetTick,
      ...snapshot,
    });
  }

  const trace = {
    schemaVersion: 1,
    fixtureId: fixture.id,
    source: await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.source),
    viewport: fixture.viewport,
    checkpoints,
    pointerEvents: (await page.evaluate(() => window.__TEAR_POINTER_EVENTS__))
      .map((entry) => ({ ...entry, atMs: finiteOrNull(entry.atMs) })),
    tickEvents: await page.evaluate(() => window.__TEAR_PARITY_TICK__.events),
    pageErrors,
  };
  await page.close();
  return trace;
}

function checkpoint(trace, label) {
  const found = trace.checkpoints.find((entry) => entry.label === label);
  assert.ok(found, `missing ${label} checkpoint`);
  return found;
}

function assertCurrentLifecycle(trace) {
  assert.deepEqual(trace.pageErrors, [], `current blade trace page errors:\n${trace.pageErrors.join("\n")}`);
  const captured = checkpoint(trace, "pointer-captured");
  const shortDelta = checkpoint(trace, "short-locked-delta");
  const longDelta = checkpoint(trace, "long-locked-delta");
  const tether = checkpoint(trace, "tether-loaded");
  const flight = checkpoint(trace, "throw-flight");
  const paused = checkpoint(trace, "paused-after-capture-loss");
  const fresh = checkpoint(trace, "fresh-run-settled");

  assert.equal(captured.input.pointerLocked, true, "gameplay click captures the pointer");
  assert.equal(captured.cursor.lockHintVisible, false, "capture hides the pointer-lock hint");
  assert.ok(shortDelta.blade.aimY > captured.blade.aimY + 2,
    "a short locked delta steers the player-relative reticle in its raw movement direction");
  assert.ok(longDelta.blade.aimX > shortDelta.blade.aimX + 10,
    "a long locked delta steers the reticle in its raw movement direction");
  assert.equal(tether.input.tetherHeld, true, "holding primary engages the blade tether");
  assert.notEqual(flight.blade.state, "held", "right-click launches the blade");
  assert.equal(paused.screen, "paused", "capture loss pauses the live run");
  assert.equal(paused.input.pointerLocked, false, "paused play releases pointer capture");
  assert.equal(paused.input.pointerLockAllowed, false, "paused play cannot immediately recapture");
  assert.equal(fresh.screen, "playing", "a replacement run reaches live play");
  assert.equal(fresh.blade.state, "held", "a replacement run resets the blade lifecycle");
  assert.ok(Number.isFinite(fresh.blade.tipX) && Number.isFinite(fresh.blade.tipY),
    "fresh-run blade geometry remains finite");
}

function assertCurrentLocomotion(trace) {
  assert.deepEqual(trace.pageErrors, [], `current locomotion trace page errors:\n${trace.pageErrors.join("\n")}`);
  const settled = checkpoint(trace, "grounded-settled");
  const accelerating = checkpoint(trace, "right-acceleration");
  const airborne = checkpoint(trace, "jump-ascent");
  const dash = checkpoint(trace, "dash-edge");
  const reversed = checkpoint(trace, "left-reversal");
  const landed = checkpoint(trace, "landed-reset");

  assert.equal(settled.player.onGround, true, "the fixture begins on stable ground");
  assert.ok(accelerating.player.x > settled.player.x + 10 && accelerating.player.vx > 0,
    "held right movement accelerates and advances the player");
  assert.equal(airborne.player.onGround, false, "jump leaves the ground");
  assert.ok(airborne.player.vy < 0, "jump produces upward velocity");
  assert.ok(dash.player.dashTimer > 0 && dash.player.vx > accelerating.player.vx,
    "the airborne directional dash enters its authored burst");
  assert.ok(reversed.player.vx < 0, "opposite input reverses horizontal motion");
  assert.equal(landed.player.onGround, true, "the player lands after the scripted arc");
  assert.ok(Math.abs(landed.player.vy) < 0.001, "landing resolves vertical velocity");
}

function assertCurrentEnemyCharge(trace) {
  assert.deepEqual(trace.pageErrors, [], `current enemy trace page errors:\n${trace.pageErrors.join("\n")}`);
  const windup = checkpoint(trace, "charge-windup").enemies[0];
  const commit = checkpoint(trace, "charge-commit").enemies[0];
  const advancing = checkpoint(trace, "charge-advancing").enemies[0];
  const recovery = checkpoint(trace, "charge-recovery").enemies[0];

  assert.equal(windup.attack, "windup", "the authored enemy begins in its readable windup");
  assert.equal(commit.attack, "commit", "the windup transitions into a committed charge");
  assert.ok(commit.vx < -500, "the committed charge moves toward the player");
  assert.ok(advancing.x < commit.x - 20, "the charge advances through the arena");
  assert.equal(recovery.attack, "recover", "the committed attack enters recovery");
  assert.ok(recovery.attackCooldown > 0, "recovery owns the next-attack cooldown");
  assert.ok(recovery.aliveT > windup.aliveT, "the enemy AI clock keeps advancing");
}

function assertCurrentCombatResolution(trace) {
  assert.deepEqual(trace.pageErrors, [], `current combat trace page errors:\n${trace.pageErrors.join("\n")}`);
  const strike = checkpoint(trace, "strike-resolved");
  const recovered = checkpoint(trace, "timers-recovered");
  assert.equal(strike.combat.enemyCount, 1, "the lethal target is removed in the collision tail");
  assert.equal(strike.combat.waveKills, 1, "the lethal strike enters normal kill credit");
  assert.equal(strike.combat.heldHits, 2, "the held blade records both real collision targets");
  assert.ok(strike.enemies[0].hp < strike.enemies[0].maxHp, "the surviving target takes blade damage");
  assert.ok(Math.abs(strike.enemies[0].vx) > 0, "the surviving target receives blade knockback");
  assert.ok(strike.enemies[0].hitCooldown > 0, "the surviving target owns a post-hit immunity window");
  assert.ok(strike.enemies[0].stun > 0, "stun remains active immediately after the strike");
  assert.ok(recovered.enemies[0].hitCooldown <= 0, "the hit immunity window expires");
  assert.ok(recovered.enemies[0].stun <= 0, "the stun timer recovers instead of freezing AI");
}

function assertCurrentRangedCycle(trace) {
  assert.deepEqual(trace.pageErrors, [], `current ranged trace page errors:\n${trace.pageErrors.join("\n")}`);
  const entered = checkpoint(trace, "windup-entered");
  const late = checkpoint(trace, "telegraph-late");
  const fired = checkpoint(trace, "volley-fired");
  assert.equal(entered.enemies[0].aiState, "windup", "the shooter enters its authored telegraph");
  assert.ok(entered.enemies[0].windTime > 0 && entered.enemies[0].windMax > 0,
    "the telegraph owns a finite windup window");
  assert.ok(late.enemies[0].windTime < entered.enemies[0].windTime,
    "the telegraph counts down through production enemy updates");
  assert.equal(fired.enemies[0].aiState, "kite", "the shooter returns to kiting after firing");
  assert.ok(fired.enemies[0].aimTimer > 0, "the next-shot cooldown resets after the volley");
  assert.equal(fired.projectiles.length, 2, "the default Ranged attack emits its authored double tap");
  assert.ok(fired.projectiles.every((projectile) => projectile.vx < 0),
    "both hostile projectiles travel toward the player");
  assert.ok(fired.projectiles.every((projectile) => projectile.family === "ordinaryProjectile"
    && projectile.deflected === false), "the volley enters the ordinary hostile projectile family");
}

function assertCurrentProjectileParry(trace) {
  assert.deepEqual(trace.pageErrors, [], `current parry trace page errors:\n${trace.pageErrors.join("\n")}`);
  const resolved = checkpoint(trace, "perfect-counter");
  const impact = checkpoint(trace, "source-impact");
  assert.equal(resolved.projectiles.length, 1, "the reflected projectile survives the collision tick");
  assert.equal(resolved.projectiles[0].deflected, true, "the hostile projectile becomes player-deflected");
  assert.equal(resolved.projectiles[0].perfect, true, "the high-speed counter resolves as a perfect parry");
  assert.ok(resolved.projectiles[0].vx > 0, "the perfect parry homes the projectile toward its owner");
  assert.ok(resolved.projectiles[0].deflectDamage > resolved.projectiles[0].damage,
    "the reflected projectile receives its authored counter damage");
  assert.equal(resolved.combat.perfectParries, 1, "the run records the perfect parry exactly once");
  assert.ok(resolved.player.guardTime > 0, "Riposte guard is granted by the full counter");
  assert.equal(impact.projectiles.length, 0, "the homing counter is consumed by its source");
  assert.ok(impact.enemies[0].hp < impact.enemies[0].maxHp,
    "the reflected projectile damages the enemy that fired it");
  assert.equal(impact.combat.perfectParries, 1, "source impact cannot double-credit the counter");
}

function assertCurrentMirrorPursuit(trace) {
  assert.deepEqual(trace.pageErrors, [], `current Mirror trace page errors:\n${trace.pageErrors.join("\n")}`);
  const attached = checkpoint(trace, "mirror-attached");
  const pursuing = checkpoint(trace, "pursuit-commit");
  const closing = checkpoint(trace, "pursuit-closing");
  assert.equal(attached.mirror.active, true, "the live host attaches the Mirror brain");
  assert.equal(attached.mirror.attached, true, "the Mirror brain owns the authored host");
  assert.equal(attached.mirror.phase, 1, "full health begins in the sealed phase");
  assert.equal(attached.mirror.state, "approach", "neutral AI chooses approach at long range");
  assert.equal(attached.mirror.move, null, "the committed-move director remains gated during pursuit");
  assert.equal(attached.mirror.blade.state, "held", "the reflected blade remains live and attached");
  assert.ok(pursuing.mirror.actor.x < attached.mirror.actor.x
    && pursuing.mirror.actor.vx < 0, "the real player integrator drives the Echo toward the player");
  assert.ok(closing.mirror.actor.x < pursuing.mirror.actor.x,
    "the pursuit continues across later authoritative ticks");
  const attachedReadError = Math.abs(attached.mirror.readDistance
    - Math.abs(attached.mirror.actor.x - attached.player.x));
  const closingReadError = Math.abs(closing.mirror.readDistance
    - Math.abs(closing.mirror.actor.x - closing.player.x));
  assert.ok(closingReadError < attachedReadError,
    "the perception model converges on the live closing distance");
  assert.ok(closing.mirror.sync > attached.mirror.sync,
    "sync escalation advances while the boss remains active");
  assert.ok(closing.mirror.moveCooldown < attached.mirror.moveCooldown,
    "the committed-move clock advances without firing early");
  assert.ok(Number.isFinite(closing.mirror.blade.tipX) && Number.isFinite(closing.mirror.blade.tipY),
    "the Echo blade tracks finite geometry throughout pursuit");
}

async function main() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8"));
  const currentOnly = process.argv.includes("--current-only");
  const currentRoot = path.resolve(
    process.env.TEAR_PARITY_CURRENT_ROOT
      || path.join(REPOSITORY_ROOT, "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone"),
  );
  const oracleRoot = path.resolve(
    process.env.TEAR_ORACLE_ROOT || path.join(REPOSITORY_ROOT, "..", "Tear-oracle"),
  );
  assert.ok(fs.existsSync(path.join(currentRoot, "index.html")),
    `${currentRoot} is missing; run pnpm build:test:standalone first`);
  if (!currentOnly) {
    assert.ok(fs.existsSync(path.join(oracleRoot, "index.html")),
      `${oracleRoot} is missing; set TEAR_ORACLE_ROOT to the ee5e931 worktree`);
    const oracleHead = execFileSync("git", ["-C", oracleRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(oracleHead, ORACLE_REVISION,
      `oracle worktree is ${oracleHead}; expected ${ORACLE_REVISION}`);
  }

  const currentServer = createStaticServer(currentRoot, Number(process.env.TEAR_PARITY_CURRENT_PORT || 8134));
  const oracleServer = currentOnly
    ? null
    : createStaticServer(oracleRoot, Number(process.env.TEAR_PARITY_ORACLE_PORT || 8135));
  let browser;
  try {
    await currentServer.listen();
    if (oracleServer) await oracleServer.listen();
    browser = await chromium.launch({ headless: true });
    const currentTrace = await captureTrace(browser, "current", currentServer.baseUrl, currentRoot, fixture);
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    const currentFile = path.join(OUTPUT_ROOT, `${fixture.id}.current.json`);
    fs.writeFileSync(currentFile, `${JSON.stringify(currentTrace, null, 2)}\n`);
    if (fixture.contract === "player-locomotion") assertCurrentLocomotion(currentTrace);
    else if (fixture.contract === "enemy-charge-cycle") assertCurrentEnemyCharge(currentTrace);
    else if (fixture.contract === "combat-resolution") assertCurrentCombatResolution(currentTrace);
    else if (fixture.contract === "ranged-fire-cycle") assertCurrentRangedCycle(currentTrace);
    else if (fixture.contract === "projectile-parry") assertCurrentProjectileParry(currentTrace);
    else if (fixture.contract === "mirror-pursuit") assertCurrentMirrorPursuit(currentTrace);
    else assertCurrentLifecycle(currentTrace);

    if (oracleServer) {
      const oracleTrace = await captureTrace(browser, "oracle", oracleServer.baseUrl, oracleRoot, fixture);
      const oracleFile = path.join(OUTPUT_ROOT, `${fixture.id}.oracle.json`);
      fs.writeFileSync(oracleFile, `${JSON.stringify(oracleTrace, null, 2)}\n`);
      const { compareParityTraces } = await import(pathToFileURL(
        path.join(REPOSITORY_ROOT, "scripts", "parity-diff.mjs"),
      ).href);
      const report = compareParityTraces(oracleTrace, currentTrace, fixture.comparison);
      const reportFile = path.join(OUTPUT_ROOT, `${fixture.id}.report.json`);
      fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`${fixture.id} parity trace captured: ${report.comparedCheckpoints} checkpoints, ${report.divergenceCount} divergences`);
      if (report.firstDivergence) console.log(`first divergence: ${report.firstDivergence.label} / ${report.firstDivergence.field}`);
      console.log(`report: ${reportFile}`);
      if (process.env.TEAR_PARITY_STRICT === "1") assert.equal(report.passed, true,
        `strict ${fixture.id} parity failed at ${report.firstDivergence?.label} / ${report.firstDivergence?.field}`);
    } else {
      console.log(`current ${fixture.id} passed (${currentTrace.checkpoints.length} checkpoints)`);
    }
  } finally {
    if (browser) await browser.close();
    if (oracleServer) await oracleServer.close();
    await currentServer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
