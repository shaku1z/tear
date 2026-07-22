import { SemanticInputBuffer } from "./semantic-buffer";
import type { Insets, LegacyInputConfig, Overscan } from "./legacy-input-contracts";

export interface LegacyBrowserPorts {
  readonly config: LegacyInputConfig;
  readonly safeArea: Insets;
  readonly overscan: Overscan;
  readonly window: Window;
  readonly document: Document;
  readonly navigator: Navigator;
  readonly performance: Performance;
}

export interface LegacyInputFactoryDependencies extends LegacyBrowserPorts {
  readonly semantic: SemanticInputBuffer;
}

export interface LegacyGamepadFactoryDependencies<TInput> {
  readonly config: LegacyInputConfig;
  readonly window: Window;
  readonly navigator: Navigator;
  readonly input: TInput;
  readonly semantic: SemanticInputBuffer;
}

export interface LegacyInputFactories<TInput, TPad, TPresets> {
  readonly createInput: (dependencies: LegacyInputFactoryDependencies) => TInput;
  readonly createGamepad: (dependencies: LegacyGamepadFactoryDependencies<TInput>) => Readonly<{
    PAD: TPad;
    PAD_PRESETS: TPresets;
  }>;
}

/** Explicitly composes the temporary callable surface consumed by classic game files. */
export function createLegacyInputCompatibility<TInput, TPad, TPresets>(
  ports: LegacyBrowserPorts,
  factories: LegacyInputFactories<TInput, TPad, TPresets>,
): Readonly<{
  Input: TInput;
  PAD: TPad;
  PAD_PRESETS: TPresets;
  semanticInput: SemanticInputBuffer;
}> {
  const semanticInput = new SemanticInputBuffer();
  const Input = factories.createInput({ ...ports, semantic: semanticInput });
  const { PAD, PAD_PRESETS } = factories.createGamepad({
    config: ports.config,
    window: ports.window,
    navigator: ports.navigator,
    input: Input,
    semantic: semanticInput,
  });
  return Object.freeze({ Input, PAD, PAD_PRESETS, semanticInput });
}
