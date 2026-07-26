#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TRACE_SCHEMA_VERSION = 1;

const STRICT_PATHS = new Set([
  "screen",
  "input.mode",
  "input.pointerLocked",
  "input.pointerLockAllowed",
  "cursor.drawn",
  "cursor.lockHintVisible",
  "blade.state",
  "player.onGround",
  "enemies.0.kind",
  "enemies.0.behavior",
  "enemies.0.attack",
  "enemies.0.aiState",
  "enemies.0.onGround",
  "projectiles.0.family",
  "projectiles.0.kind",
  "projectiles.0.deflected",
  "projectiles.0.perfect",
  "projectiles.0.charged",
  "projectiles.1.family",
  "projectiles.1.kind",
]);

const DEFAULT_TOLERANCES = Object.freeze({
  "player.x": 6,
  "player.y": 6,
  "player.vx": 45,
  "player.vy": 45,
  "player.coyote": 0.02,
  "player.jumpBuffer": 0.02,
  "player.dashTimer": 0.02,
  "player.dashCooldown": 0.02,
  "player.guardTime": 0.02,
  "enemies.0.x": 8,
  "enemies.0.y": 6,
  "enemies.0.vx": 45,
  "enemies.0.vy": 45,
  "enemies.0.hp": 0.01,
  "enemies.0.stun": 0.02,
  "enemies.0.spawnT": 0.02,
  "enemies.0.aliveT": 0.02,
  "enemies.0.attackTime": 0.02,
  "enemies.0.attackCooldown": 0.02,
  "enemies.0.attackDirection": 0,
  "enemies.0.chargePower": 0.001,
  "enemies.0.maxHp": 0.01,
  "enemies.0.hitCooldown": 0.02,
  "enemies.0.aimTimer": 0.02,
  "enemies.0.windTime": 0.02,
  "enemies.0.windMax": 0.02,
  "projectiles.0.x": 12,
  "projectiles.0.y": 12,
  "projectiles.0.vx": 45,
  "projectiles.0.vy": 45,
  "projectiles.0.r": 0.01,
  "projectiles.0.life": 0.02,
  "projectiles.0.damage": 0.01,
  "projectiles.0.deflectDamage": 0.01,
  "projectiles.1.x": 12,
  "projectiles.1.y": 12,
  "projectiles.1.vx": 45,
  "projectiles.1.vy": 45,
  "projectiles.1.r": 0.01,
  "projectiles.1.life": 0.02,
  "projectiles.1.damage": 0.01,
  "combat.enemyCount": 0,
  "combat.waveKills": 0,
  "combat.heldHits": 0,
  "combat.perfectParries": 0,
  "blade.x": 10,
  "blade.y": 10,
  "blade.vx": 90,
  "blade.vy": 90,
  "blade.tipX": 14,
  "blade.tipY": 14,
  "blade.tipVX": 180,
  "blade.tipVY": 180,
  "blade.aimX": 4,
  "blade.aimY": 4,
  "blade.reticleX": 8,
  "blade.reticleY": 8,
  "blade.flyTime": 0.05,
  "blade.tension": 0.04,
});

const COMPARISON_PATHS = [
  ...STRICT_PATHS,
  ...Object.keys(DEFAULT_TOLERANCES),
];

function valueAt(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function sameValue(oracle, current, tolerance) {
  if (typeof oracle === "number" && typeof current === "number") {
    if (!Number.isFinite(oracle) || !Number.isFinite(current)) return Object.is(oracle, current);
    return Math.abs(current - oracle) <= tolerance;
  }
  return Object.is(oracle, current);
}

function validateTrace(trace, label) {
  if (trace?.schemaVersion !== TRACE_SCHEMA_VERSION) {
    throw new Error(`${label} trace uses schema ${String(trace?.schemaVersion)}; expected ${TRACE_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(trace.checkpoints)) throw new Error(`${label} trace has no checkpoints array`);
}

export function compareParityTraces(oracleTrace, currentTrace, options = {}) {
  validateTrace(oracleTrace, "oracle");
  validateTrace(currentTrace, "current");
  const tolerances = { ...DEFAULT_TOLERANCES, ...(options.tolerances ?? {}) };
  const currentByLabel = new Map(currentTrace.checkpoints.map((checkpoint) => [checkpoint.label, checkpoint]));
  const divergences = [];
  const missing = [];
  const unaligned = [];

  for (let index = 0; index < oracleTrace.checkpoints.length; index += 1) {
    const oracle = oracleTrace.checkpoints[index];
    const current = currentByLabel.get(oracle.label);
    if (!current) {
      missing.push({ side: "current", label: oracle.label });
      continue;
    }
    const requiresTickAlignment = oracle.screen === "playing" || current.screen === "playing";
    for (const field of COMPARISON_PATHS) {
      if (!STRICT_PATHS.has(field)
        && requiresTickAlignment
        && Number.isFinite(oracle.simulationTick)
        && Number.isFinite(current.simulationTick)
        && oracle.simulationTick !== current.simulationTick) continue;
      const oracleValue = valueAt(oracle, field);
      const currentValue = valueAt(current, field);
      if (oracleValue == null && currentValue == null) continue;
      const tolerance = STRICT_PATHS.has(field) ? 0 : (tolerances[field] ?? 0);
      if (!sameValue(oracleValue, currentValue, tolerance)) {
        divergences.push({
          checkpointIndex: index,
          label: oracle.label,
          field,
          oracle: oracleValue ?? null,
          current: currentValue ?? null,
          tolerance,
          ...(typeof oracleValue === "number" && typeof currentValue === "number"
            ? { delta: currentValue - oracleValue }
            : {}),
        });
      }
    }
    if (requiresTickAlignment
      && Number.isFinite(oracle.simulationTick) && Number.isFinite(current.simulationTick)
      && oracle.simulationTick !== current.simulationTick) {
      const alignment = {
        checkpointIndex: index,
        label: oracle.label,
        field: "simulationTick",
        oracle: oracle.simulationTick,
        current: current.simulationTick,
        tolerance: 0,
        delta: current.simulationTick - oracle.simulationTick,
      };
      unaligned.push(alignment);
      divergences.push(alignment);
    }
  }

  const oracleLabels = new Set(oracleTrace.checkpoints.map((checkpoint) => checkpoint.label));
  for (const checkpoint of currentTrace.checkpoints) {
    if (!oracleLabels.has(checkpoint.label)) missing.push({ side: "oracle", label: checkpoint.label });
  }

  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    fixtureId: oracleTrace.fixtureId,
    oracle: oracleTrace.source,
    current: currentTrace.source,
    comparedCheckpoints: oracleTrace.checkpoints.length - missing.filter((entry) => entry.side === "current").length,
    divergenceCount: divergences.length,
    unalignedCheckpointCount: unaligned.length,
    missing,
    firstDivergence: divergences[0] ?? null,
    divergences,
    passed: divergences.length === 0 && missing.length === 0,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function printUsage() {
  console.error("Usage: node scripts/parity-diff.mjs <oracle-trace.json> <current-trace.json> [report.json]");
}

const isEntryPoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  const [, , oracleFile, currentFile, reportFile] = process.argv;
  if (!oracleFile || !currentFile) {
    printUsage();
    process.exitCode = 2;
  } else {
    const report = compareParityTraces(readJson(oracleFile), readJson(currentFile));
    const rendered = `${JSON.stringify(report, null, 2)}\n`;
    if (reportFile) fs.writeFileSync(path.resolve(reportFile), rendered);
    process.stdout.write(rendered);
    process.exitCode = report.passed ? 0 : 1;
  }
}
