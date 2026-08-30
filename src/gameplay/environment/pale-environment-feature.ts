import type { EnvironmentFeature, EnvironmentFeatureContext } from "./environment-feature-ports";
import { assertGhostTrackRouteState, assertAuroraTrackFieldState } from "./aurora-track";
import { advanceAuroraTrack, type AuroraTransportActor } from "./aurora-track-runtime";
import { advanceGhostTrackRoute, installWhiteHartEnvironmentRequest, type WhiteHartEnvironmentRequest } from "./white-hart-route-runtime";

/** Pale-only environment behavior. The kernel sees this solely as a feature port. */
export class PaleEnvironmentFeature implements EnvironmentFeature {
  readonly id = "pale";
  isActive(environment: EnvironmentFeatureContext): boolean {
    return environment.stageId === "pale-traverse"
      || environment.fields().some((field) => field.kind === "aurora-track")
      || environment.routes().some((route) => route.kind === "ghost-track")
      || (this.#whiteHartActors?.().length ?? 0) > 0;
  }
  claimsField(field: ReturnType<EnvironmentFeatureContext["fields"]>[number]): boolean { return field.kind === "aurora-track"; }
  #auroraActors: (() => readonly AuroraTransportActor[]) | undefined;
  #whiteHartActors: (() => readonly WhiteHartEnvironmentActor[]) | undefined;

  setActorSource(slot: string, source: (() => readonly unknown[]) | undefined): void {
    if (slot === "aurora-track") this.#auroraActors = source as (() => readonly AuroraTransportActor[]) | undefined;
    if (slot === "white-hart") this.#whiteHartActors = source as (() => readonly WhiteHartEnvironmentActor[]) | undefined;
  }

  step(environment: EnvironmentFeatureContext, tick: number, seconds: number): void {
    const actors = this.#whiteHartActors?.() ?? [];
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    for (const actor of actors) {
      const phaseToken = `:p${String(actor.state.phase)}:`;
      for (const field of environment.fields()) if (field.ownerId === actor.id && field.kind === "aurora-track") {
        assertAuroraTrackFieldState(field);
        if (field.variant === "boss-wake" && !field.id.includes(phaseToken)
          && field.state !== "expired" && field.state !== "destroyed") environment.updateField(field.id, { state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
      }
      for (const route of environment.routes()) if (route.ownerId === actor.id && route.kind === "ghost-track"
        && !route.id.includes(phaseToken) && route.state !== "expired" && route.state !== "destroyed") environment.updateRoute(route.id, { state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
      let acknowledged = 0;
      for (const request of actor.state.requests) { installWhiteHartEnvironmentRequest(environment, actor.id, request, tick); acknowledged = Math.max(acknowledged, request.sequence); }
      if (acknowledged > 0) actor.acknowledgeRequests(acknowledged);
    }
    for (const route of environment.routes()) {
      if (route.kind !== "ghost-track" || route.ownerId === null) continue;
      assertGhostTrackRouteState(route);
      const actor = byId.get(route.ownerId);
      const result = advanceGhostTrackRoute(route, tick, actor?.player);
      if (result.route !== route) environment.updateRoute(route.id, result.route);
      if (result.hit && actor?.player !== undefined) actor.player.takeDamage(route.damage, route.points[0]?.x ?? 0, actor.source);
    }
    for (const field of environment.fields()) {
      if (field.kind !== "aurora-track") continue;
      assertAuroraTrackFieldState(field);
      const result = advanceAuroraTrack(field, tick, seconds, this.#auroraActors?.() ?? [], environment.events);
      if (result.field !== field) environment.updateField(field.id, result.field);
    }
  }

}

export interface WhiteHartEnvironmentActor {
  readonly id: string; readonly source: unknown;
  readonly state: Readonly<{ phase: 1 | 2 | 3; requests: readonly WhiteHartEnvironmentRequest[] }>;
  readonly acknowledgeRequests: (throughSequence: number) => void;
  readonly player?: Readonly<{ id: string; x: number; y: number; hw: number; hh: number; invulnerable: boolean;
    hazardDamageMultiplier: number; takeDamage: (damage: number, sourceX: number, source: unknown) => void }>;
}

export function createPaleEnvironmentFeature(): PaleEnvironmentFeature { return new PaleEnvironmentFeature(); }
