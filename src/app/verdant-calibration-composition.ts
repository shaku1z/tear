import { createPreparedVerdantCalibration, loadCalibrationBitmap } from "../presentation/prepared-verdant-calibration";
import { createPreparedVerdantMaterial } from "../presentation/platform-materials/prepared-verdant-material";
import verdantLayerPackage from "../presentation/assets/verdant-calibration/scene-package.json";
import verdantOverscanPackage from "../presentation/assets/verdant-calibration/overscan-package.json";
import verdantControlPackage from "../presentation/assets/verdant-calibration/control-package.json";
import verdantLivingPackage from "../presentation/assets/verdant-calibration/living-stage-package.json";

export type VerdantSceneNativeSelection = "1" | "control" | "layers" | "living";

/**
 * Test-build-only Verdant image-native calibration scene (`?sceneNative=`).
 * Composition imports this module dynamically behind the test-build constant,
 * so release bundles neither contain nor precache its packages and images.
 * Only the selected package is fetched and decoded. The composition owns the
 * returned calibration and material for the page lifetime.
 */
export function createVerdantCalibrationComposition(selection: VerdantSceneNativeSelection, target: Window) {
  const calibration = createPreparedVerdantCalibration(selection === "control" ? verdantControlPackage
    : selection === "layers" ? verdantLayerPackage : selection === "living" ? verdantLivingPackage : verdantOverscanPackage, {
    "structure-top": new URL("../presentation/assets/verdant-calibration/structure-top.webp", import.meta.url).href,
    "structure-bottom": new URL("../presentation/assets/verdant-calibration/structure-bottom.webp", import.meta.url).href,
    foliage: new URL("../presentation/assets/verdant-calibration/foliage.webp", import.meta.url).href,
    "exterior-top-left": new URL("../presentation/assets/verdant-calibration/exterior-top-left.webp", import.meta.url).href,
    "exterior-top-right": new URL("../presentation/assets/verdant-calibration/exterior-top-right.webp", import.meta.url).href,
    "exterior-bottom-left": new URL("../presentation/assets/verdant-calibration/exterior-bottom-left.webp", import.meta.url).href,
    "exterior-bottom-right": new URL("../presentation/assets/verdant-calibration/exterior-bottom-right.webp", import.meta.url).href,
    "exterior-left": new URL("../presentation/assets/verdant-calibration/exterior-left.webp", import.meta.url).href,
    "exterior-right": new URL("../presentation/assets/verdant-calibration/exterior-right.webp", import.meta.url).href,
    "control-top": new URL("../presentation/assets/verdant-calibration/calibration-top.png", import.meta.url).href,
    "control-bottom": new URL("../presentation/assets/verdant-calibration/calibration-bottom.png", import.meta.url).href,
    "support-top": new URL("../presentation/assets/verdant-calibration/support-top.png", import.meta.url).href,
    "support-bottom": new URL("../presentation/assets/verdant-calibration/support-bottom.png", import.meta.url).href,
    tail: new URL("../presentation/assets/verdant-calibration/tail.png", import.meta.url).href,
    "tail-motion": new URL("../presentation/assets/verdant-calibration/tail-motion.png", import.meta.url).href,
  }, loadCalibrationBitmap);
  const material = createPreparedVerdantMaterial(new URL("../presentation/assets/verdant-calibration/moss-stone.webp", import.meta.url).href);
  void calibration.prepare();
  void material.prepare();
  target.addEventListener("pagehide", (event) => {
    if (!event.persisted) calibration.dispose();
  });
  target.addEventListener("pagehide", (event) => {
    if (!event.persisted) material.dispose();
  });
  return Object.freeze({ calibration, material });
}
