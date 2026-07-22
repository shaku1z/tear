export type * from "./voidgen-contracts";

import type { VoidGenerator } from "./voidgen-contracts";
import { create, generate, ingress, materialize, next } from "./voidgen-chunks";
import { DEFAULTS, MOTIFS } from "./voidgen-core";
import { cageGeometry, hazardState, selectRescue } from "./voidgen-hazards";
import { inspect } from "./voidgen-inspection";

export const VoidGen: VoidGenerator = Object.freeze({
  defaults: DEFAULTS,
  motifs: MOTIFS,
  create,
  next,
  generate,
  inspect,
  hazardState,
  selectRescue,
  cageGeometry,
  materialize,
  ingress,
});
