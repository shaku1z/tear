export interface LiveInputAuthorityState {
  readonly semanticInputAuthority: () => boolean;
  readonly setSemanticInputAuthority: (active: boolean) => void;
  readonly requestPointerLock: () => void;
  readonly allowsDeviceAimCapture: () => boolean;
}

/** Keeps automated-input authority from performing browser-owned device actions. */
export function createLiveInputAuthorityState(
  requestPointerLock: () => void,
): LiveInputAuthorityState {
  let semanticInputAuthority = false;
  return Object.freeze({
    semanticInputAuthority: () => semanticInputAuthority,
    setSemanticInputAuthority: (active) => { semanticInputAuthority = active; },
    requestPointerLock: () => { if (!semanticInputAuthority) requestPointerLock(); },
    allowsDeviceAimCapture: () => !semanticInputAuthority,
  } satisfies LiveInputAuthorityState);
}
