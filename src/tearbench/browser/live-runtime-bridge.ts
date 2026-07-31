import type {
  LiveTearRuntimeEnvironmentContext,
  TearClassARuntimeEnvironment,
  TearClassBRuntimeEnvironment,
  TearClassCRuntimeEnvironment,
  TearPhysicalInput,
  TearRuntimeBridgeFactory,
  TearRuntimeEnvironment,
} from "../live-runtime-contracts";
import { createLiveTearRuntimeEnvironment } from "../live-runtime-environment";
import { installGhostLabPanel } from "./ghost-lab-panel";
import { installLiveStateForgeStudio } from "./live-state-forge-studio-host";

type LiveRuntimeBridgeWindow = Window & { __TEAR_RUNTIME_ENVIRONMENT__?: TearRuntimeBridgeFactory };

/** Browser/test-build installer for the otherwise DOM-free live environment. */
export function installLiveTearRuntimeBridge(
  context: LiveTearRuntimeEnvironmentContext,
  target: LiveRuntimeBridgeWindow,
): void {
  function createAdapter(accessClass: "A"): TearClassARuntimeEnvironment;
  function createAdapter(accessClass: "B"): TearClassBRuntimeEnvironment;
  function createAdapter(accessClass: "C"): TearClassCRuntimeEnvironment;
  function createAdapter(accessClass: string): TearRuntimeEnvironment {
    if (accessClass === "A") return createLiveTearRuntimeEnvironment(context, "A");
    if (accessClass === "B") return createLiveTearRuntimeEnvironment(context, "B");
    if (accessClass === "C") {
      return Object.freeze({
        accessClass: "C" as const,
        screenshot: () => { context.render(); return context.screenshot(); },
        physicalInput: (input: TearPhysicalInput) => { context.emitPhysicalInput(input); },
      });
    }
    throw new RangeError(`unknown Tear runtime access class: ${accessClass}`);
  }
  const factory: TearRuntimeBridgeFactory = Object.freeze({ create: createAdapter });
  Object.defineProperty(target, "__TEAR_RUNTIME_ENVIRONMENT__", {
    configurable: false,
    writable: false,
    value: factory,
  });
  installGhostLabPanel(factory);
  installLiveStateForgeStudio(factory);
  if (new URLSearchParams(target.location.search).get("watchagent") === "1") {
    void import("../../agents/live-watch-agent-host").then(({ installLiveWatchAgentHost }) => {
      installLiveWatchAgentHost(context, target);
    });
  }
}
