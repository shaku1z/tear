declare const __TEAR_TEST_BUILD__: boolean;
/** True in test builds and under `vite dev`; false in release builds. */
declare const __TEAR_ENGINEERING_SURFACES__: boolean;
/**
 * True where the build keeps the mobile-only modules: test builds, `vite dev`, and a target whose
 * `mobile` is true in config/build-targets.json. Mobile is paused (plans/MOBILE_LATER.md).
 */
declare const __TEAR_MOBILE__: boolean;
declare const __TEAR_BUILD_REVISION__: string;
declare const __TEAR_BUILD_SOURCE_STATE__: "clean" | "dirty";
declare const __TEAR_BUILD_SOURCE_FINGERPRINT__: string;
declare const __TEAR_BUILD_MODE__: string;
declare const __TEAR_BUILD_TARGET__: "standalone" | "crazygames" | "itch";
