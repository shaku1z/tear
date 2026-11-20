import type { EnvironmentFeature, EnvironmentFeatureContext } from "./environment-feature-ports";
import { assertGhostTrackRouteState, assertAuroraTrackFieldState, type AuroraTrackFieldState } from "./aurora-track";
import { advanceAuroraTrack, applyAuroraTrackSpeed, type AuroraTrackActor } from "./aurora-track-runtime";
import {
  advanceGhostTrackRoute,
  installWhiteHartEnvironmentRequest,
  type WhiteHartEnvironmentRequest,
} from "./white-hart-route-runtime";

/** Pale-only environment behavior. The kernel sees this solely as a feature port. */
export class PaleEnvironmentFeature implements EnvironmentFeature {
  readonly id = "pale";
  isActive(environment: EnvironmentFeatureContext): boolean {
    return (
      environment.stageId === "pale-traverse" ||
      environment.fields().some((field) => field.kind === "aurora-track") ||
      environment.routes().some((route) => route.kind === "ghost-track") ||
      (this.#whiteHartActors?.().length ?? 0) > 0
    );
  }
  claimsField(field: ReturnType<EnvironmentFeatureContext["fields"]>[number]): boolean {
    return field.kind === "aurora-track";
  }
  #auroraActors: (() => readonly AuroraTrackActor[]) | undefined;
  #whiteHartActors: (() => readonly WhiteHartEnvironmentActor[]) | undefined;

  setActorSource(slot: string, source: (() => readonly unknown[]) | undefined): void {
    if (slot === "aurora-track") this.#auroraActors = source as (() => readonly AuroraTrackActor[]) | undefined;
    if (slot === "white-hart")
      this.#whiteHartActors = source as (() => readonly WhiteHartEnvironmentActor[]) | undefined;
  }

  step(environment: EnvironmentFeatureContext, tick: number, seconds: number): void {
    const actors = this.#whiteHartActors?.() ?? [];
    for (const actor of actors) {
      const phaseToken = `:p${String(actor.state.phase)}:`;
      for (const field of environment.fields())
        if (field.ownerId === actor.id && field.kind === "aurora-track") {
          assertAuroraTrackFieldState(field);
          if (
            field.variant === "boss-wake" &&
            !field.id.includes(phaseToken) &&
            field.state !== "expired" &&
            field.state !== "destroyed"
          )
            environment.updateField(field.id, { state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
        }
      for (const route of environment.routes())
        if (
          route.ownerId === actor.id &&
          route.kind === "ghost-track" &&
          !route.id.includes(phaseToken) &&
          route.state !== "expired" &&
          route.state !== "destroyed"
        )
          environment.updateRoute(route.id, { state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
      let acknowledged = 0;
      for (const request of actor.state.requests) {
        installWhiteHartEnvironmentRequest(environment, actor.id, request, tick);
        acknowledged = Math.max(acknowledged, request.sequence);
      }
      if (acknowledged > 0) actor.acknowledgeRequests(acknowledged);
    }
    for (const route of environment.routes()) {
      if (route.kind !== "ghost-track" || route.ownerId === null) continue;
      assertGhostTrackRouteState(route);
      const next = advanceGhostTrackRoute(route, tick);
      if (next !== route) environment.updateRoute(route.id, next);
    }
    void seconds;
    const travellers = this.#auroraActors?.() ?? [];
    for (const field of environment.fields()) {
      if (field.kind !== "aurora-track") continue;
      assertAuroraTrackFieldState(field);
      const next = advanceAuroraTrack(field, tick, travellers, environment.events);
      if (next !== field) environment.updateField(field.id, next);
    }
    applyAuroraTrackSpeed(tracks(environment), travellers);
  }

  /** The carry lives in the roads, so a restored world gets its speeds back from them. */
  replace(environment: EnvironmentFeatureContext): void {
    applyAuroraTrackSpeed(tracks(environment), this.#auroraActors?.() ?? []);
  }

  /** The roads are about to go: nobody keeps a raised top speed. */
  clear(): void {
    applyAuroraTrackSpeed([], this.#auroraActors?.() ?? []);
  }
}

function tracks(environment: EnvironmentFeatureContext): readonly AuroraTrackFieldState[] {
  const roads: AuroraTrackFieldState[] = [];
  for (const field of environment.fields())
    if (field.kind === "aurora-track") {
      assertAuroraTrackFieldState(field);
      roads.push(field);
    }
  return roads;
}

export interface WhiteHartEnvironmentActor {
  readonly id: string;
  readonly source: unknown;
  readonly state: Readonly<{ phase: 1 | 2 | 3; requests: readonly WhiteHartEnvironmentRequest[] }>;
  readonly acknowledgeRequests: (throughSequence: number) => void;
}

export function createPaleEnvironmentFeature(): PaleEnvironmentFeature {
  return new PaleEnvironmentFeature();
}
