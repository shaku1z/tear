import { createCloudCompatibility } from "./cloud";
import type { CloudFactory } from "./cloud-factory";
import type { AccountProvider, SharedCloudService } from "./cloud";
import type { FirebaseCloudCompatibility } from "./firebase-cloud";

/** Standalone-only cloud graph. Firebase never enters portal bundles; its SDK loads on first use. */
export const createStandaloneCloud: CloudFactory = (options) => {
  let firebase: FirebaseCloudCompatibility | undefined;
  let loading: Promise<FirebaseCloudCompatibility> | undefined;
  const load = (): Promise<FirebaseCloudCompatibility> => {
    loading ??= Promise.all([import("./firebase-cloud"), import("./firebase-config")]).then(([cloud, config]) => {
      firebase = cloud.createFirebaseCloudCompatibility({
        services: async () => (await import("./firebase-sdk")).createFirebaseServices(config.FIREBASE_CONFIG),
      });
      return firebase;
    });
    return loading;
  };
  const account: AccountProvider = {
    kind: "firebase",
    signInLabel: "SIGN IN WITH GOOGLE",
    async init(context) {
      await (await load()).account.init(context);
    },
    async signIn(context) {
      return (await load()).account.signIn?.(context) ?? false;
    },
    async signOut(context) {
      await (await load()).account.signOut?.(context);
    },
    async load(context) {
      return (await load()).account.load?.(context) ?? null;
    },
    async save(context, payload) {
      await (await load()).account.save?.(context, payload);
    },
    async replace(context, payload) {
      return (await (await load()).account.replace?.(context, payload)) ?? false;
    },
    dispose() {
      firebase?.account.dispose?.();
    },
  };
  const shared: SharedCloudService = {
    available: true,
    async submitScore(...args) {
      return (await load()).shared.submitScore(...args);
    },
    async topScores(...args) {
      return (await load()).shared.topScores(...args);
    },
    logEvent(...args) {
      void load().then((value) => {
        value.shared.logEvent(...args);
      });
    },
    async publishReplay(...args) {
      return (await load()).shared.publishReplay(...args);
    },
    async loadReplay(...args) {
      return (await load()).shared.loadReplay(...args);
    },
    async replayFeed(...args) {
      return (await load()).shared.replayFeed(...args);
    },
    async linkReplay(...args) {
      return (await load()).shared.linkReplay(...args);
    },
    async loadGhost(...args) {
      return (await load()).shared.loadGhost(...args);
    },
  };
  return createCloudCompatibility({
    ...options,
    firebaseAccount: account,
    shared,
  });
};
