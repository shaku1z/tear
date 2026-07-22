import { createCloudCompatibility } from "./cloud";
import type { CloudFactory } from "./cloud-factory";
import type { AccountProvider, SharedCloudService } from "./cloud";
import type { FirebaseCompatSdk, FirebaseCloudCompatibility } from "./firebase-cloud";
import { REMOTE } from "../config/game-config";

/** Standalone-only cloud graph. Firebase never enters portal bundles. */
export const createStandaloneCloud: CloudFactory = (options) => {
  let firebase: FirebaseCloudCompatibility | undefined;
  let loading: Promise<FirebaseCloudCompatibility> | undefined;
  const load = (): Promise<FirebaseCloudCompatibility> => {
    loading ??= Promise.all([import("./firebase-cloud"), import("./firebase-config")]).then(([cloud, config]) => {
      const firebaseWindow: Window & { readonly firebase?: FirebaseCompatSdk } = window;
      firebase = cloud.createFirebaseCloudCompatibility({ config: config.FIREBASE_CONFIG,
        getSdk: () => firebaseWindow.firebase, loadScript: cloud.createBrowserScriptLoader(document), remote: REMOTE });
      return firebase;
    });
    return loading;
  };
  const account: AccountProvider = {
    kind: "firebase", signInLabel: "SIGN IN WITH GOOGLE",
    async init(context) { await (await load()).account.init(context); },
    async signIn(context) { return (await load()).account.signIn?.(context) ?? false; },
    async signOut(context) { await (await load()).account.signOut?.(context); },
    async load(context) { return (await load()).account.load?.(context) ?? null; },
    async save(context, payload) { await (await load()).account.save?.(context, payload); },
    dispose() { firebase?.account.dispose?.(); },
  };
  const shared: SharedCloudService = {
    available: true,
    async submitScore(...args) { return (await load()).shared.submitScore(...args); },
    async topScores(...args) { return (await load()).shared.topScores(...args); },
    logEvent(...args) { void load().then((value) => { value.shared.logEvent(...args); }); },
    async publishReplay(...args) { return (await load()).shared.publishReplay(...args); },
    async loadReplay(...args) { return (await load()).shared.loadReplay(...args); },
    async replayFeed(...args) { return (await load()).shared.replayFeed(...args); },
    async linkReplay(...args) { return (await load()).shared.linkReplay(...args); },
    async loadGhost(...args) { return (await load()).shared.loadGhost(...args); },
  };
  return createCloudCompatibility({
    ...options,
    firebaseAccount: account,
    shared,
  });
};
