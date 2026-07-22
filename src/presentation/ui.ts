// TEAR canvas design-system composition root. Component families live in focused modules.
import type { UiDependencies } from "./ui-contracts";
import { createUiChapter } from "./ui-chapter";
import { createUiCinematic } from "./ui-cinematic";
import { createUiFoundation } from "./ui-foundation";
import { createUiLedger } from "./ui-ledger";
import { createUiMenu } from "./ui-menu";
import { createUiState } from "./ui-tokens";

type TearUi = ReturnType<typeof createUiState>
  & ReturnType<typeof createUiFoundation>
  & ReturnType<typeof createUiLedger>
  & ReturnType<typeof createUiCinematic>
  & ReturnType<typeof createUiChapter>
  & ReturnType<typeof createUiMenu>;

function createUi(dependencies: UiDependencies): TearUi {
  const ui: TearUi = {
    ...createUiState(dependencies.CONFIG),
    ...createUiFoundation(dependencies),
    ...createUiLedger(dependencies),
    ...createUiCinematic(dependencies),
    ...createUiChapter(dependencies),
    ...createUiMenu(dependencies),
  };
  return ui;
}

export { createUi };
