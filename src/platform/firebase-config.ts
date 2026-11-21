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
