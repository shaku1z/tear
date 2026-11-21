/** The Firebase web client's routing data: public, not a credential. */
export interface FirebaseClientConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
  readonly measurementId: string;
}

/** Public Firebase client routing data. Authorization remains in Auth and Firestore rules. */
export const FIREBASE_CONFIG: FirebaseClientConfig = Object.freeze({
  apiKey: "AIzaSyC2icGmNx0fwTWHWs1KwFVGWl125qp-FBE",
  authDomain: "tear-682cf.firebaseapp.com",
  projectId: "tear-682cf",
  storageBucket: "tear-682cf.firebasestorage.app",
  messagingSenderId: "545513135103",
  appId: "1:545513135103:web:bb60bdbd129a7e53f0e5ca",
  measurementId: "G-V83ZJV3HQ1",
});

/**
 * The reCAPTCHA v3 site key Firebase App Check attests with: public, like the config above. Empty leaves App
 * Check off. The owner registers the key in the console (plans/active/FIREBASE_REFRESH.md), and the change that
 * sets it also names reCAPTCHA on the privacy page, which tests/unit/privacy-page.test.ts holds it to.
 */
export const FIREBASE_APP_CHECK_SITE_KEY = "";
