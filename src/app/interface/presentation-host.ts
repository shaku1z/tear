import { renderButtonLayer, type ButtonLayerOptions } from "../../presentation/screens/button-layer";
import {
  renderPresentationFrame,
  type RenderPipelinePorts,
  type ScreenRectangle,
} from "../../presentation/render-pipeline";
import {
  firstEnabledUiButton,
  handleUiRuntimeFrame,
  stepRuntimeTab,
  type UiRuntimePorts,
} from "./ui-runtime-controller";

export interface PresentationDimensions {
  readonly width: number;
  readonly height: number;
  readonly overscan: () => Readonly<{ x: number; y: number }>;
}

export interface LivePresentationHostOptions<Screen extends string> {
  readonly dimensions: PresentationDimensions;
  /** Built once, on the first frame: the ports read live state through their functions, never through captured values. */
  readonly framePorts: (host: LivePresentationHost) => RenderPipelinePorts<Screen>;
  /** Built once, on first use, under the same rule as `framePorts`. */
  readonly uiPorts: () => UiRuntimePorts;
  /** Built every frame: it carries per-frame pointer, focus and timing values. */
  readonly buttonLayer: () => ButtonLayerOptions;
}

export interface LivePresentationHost {
  readonly screenRectangle: () => ScreenRectangle;
  readonly render: () => void;
  readonly handleUi: () => void;
  readonly drawButtons: () => void;
  readonly firstEnabledButton: () => number;
  readonly stepTab: <Key>(
    tabs: readonly (readonly [Key, ...(readonly unknown[])])[],
    current: Key,
    onChange?: (key: Key) => void,
  ) => Key;
}

/** Strict host for the legacy canvas frame, menu input and shared button layer. */
export function createLivePresentationHost<Screen extends string>(
  options: LivePresentationHostOptions<Screen>,
): LivePresentationHost {
  const screenRectangle = (): ScreenRectangle => {
    const overscan = options.dimensions.overscan();
    return {
      x: -overscan.x,
      y: -overscan.y,
      w: options.dimensions.width + overscan.x * 2,
      h: options.dimensions.height + overscan.y * 2,
    };
  };

  let framePorts: RenderPipelinePorts<Screen> | undefined;
  let uiPorts: UiRuntimePorts | undefined;
  const ui = (): UiRuntimePorts => {
    uiPorts ??= options.uiPorts();
    return uiPorts;
  };
  const host: LivePresentationHost = Object.freeze({
    screenRectangle,
    render: () => {
      framePorts ??= options.framePorts(host);
      renderPresentationFrame(framePorts);
    },
    handleUi: () => {
      handleUiRuntimeFrame(ui());
    },
    drawButtons: () => {
      renderButtonLayer(options.buttonLayer());
    },
    firstEnabledButton: () => firstEnabledUiButton(ui().buttons()),
    stepTab: <Key>(
      tabs: readonly (readonly [Key, ...(readonly unknown[])])[],
      current: Key,
      onChange?: (key: Key) => void,
    ): Key => {
      const ports = ui();
      return stepRuntimeTab(tabs, current, ports.input, ports.playInterfaceSound, onChange);
    },
  });
  return host;
}
