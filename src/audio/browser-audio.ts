import type {
  AudioContextFactory,
} from "./audio-system";
import type {
  AudioContextState,
  AudioGraphContext,
  AudioNodePort,
  GainNodePort,
  GainParamPort,
} from "./mixer";

class BrowserGainParamPort implements GainParamPort {
  readonly #parameter: AudioParam;

  constructor(parameter: AudioParam) {
    this.#parameter = parameter;
  }

  get value(): number {
    return this.#parameter.value;
  }

  cancelScheduledValues(time: number): void {
    this.#parameter.cancelScheduledValues(time);
  }

  setValueAtTime(value: number, time: number): void {
    this.#parameter.setValueAtTime(value, time);
  }

  linearRampToValueAtTime(value: number, endTime: number): void {
    this.#parameter.linearRampToValueAtTime(value, endTime);
  }
}

export class BrowserAudioNodePort implements AudioNodePort {
  readonly rawNode: AudioNode;

  constructor(node: AudioNode) {
    this.rawNode = node;
  }

  connect(destination: AudioNodePort): void {
    this.rawNode.connect(unwrapBrowserAudioNode(destination));
  }

  disconnect(): void {
    this.rawNode.disconnect();
  }
}

class BrowserGainNodePort extends BrowserAudioNodePort implements GainNodePort {
  readonly gain: GainParamPort;

  constructor(node: GainNode) {
    super(node);
    this.gain = new BrowserGainParamPort(node.gain);
  }
}

export class BrowserAudioGraphContext implements AudioGraphContext {
  readonly rawContext: AudioContext;
  readonly destination: AudioNodePort;

  constructor(context: AudioContext) {
    this.rawContext = context;
    this.destination = new BrowserAudioNodePort(context.destination);
  }

  get currentTime(): number {
    return this.rawContext.currentTime;
  }

  get state(): AudioContextState {
    if (this.rawContext.state === "running" || this.rawContext.state === "closed") {
      return this.rawContext.state;
    }
    return "suspended";
  }

  createGain(_label: string): GainNodePort {
    void _label;
    return new BrowserGainNodePort(this.rawContext.createGain());
  }

  async resume(): Promise<void> {
    await this.rawContext.resume();
  }

  async suspend(): Promise<void> {
    await this.rawContext.suspend();
  }

  async close(): Promise<void> {
    await this.rawContext.close();
  }
}

type AudioContextConstructor = new(contextOptions?: AudioContextOptions) => AudioContext;

interface WebkitAudioWindow extends Window {
  readonly AudioContext?: AudioContextConstructor;
  readonly webkitAudioContext?: AudioContextConstructor;
  readonly Tone?: {
    getContext?(): { readonly rawContext?: AudioContext };
  };
}

export function createBrowserAudioContextFactory(
  browserWindow: Window = window,
  providedContext: () => AudioContext | null = () => null,
): AudioContextFactory {
  return {
    create(): AudioGraphContext {
      const provided = providedContext();
      if (provided !== null) return new BrowserAudioGraphContext(provided);
      const audioWindow = browserWindow as WebkitAudioWindow;
      const sharedToneContext = audioWindow.Tone?.getContext?.().rawContext;
      if (sharedToneContext !== undefined) return new BrowserAudioGraphContext(sharedToneContext);
      const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (AudioContextConstructor === undefined) throw new Error("Web Audio is not supported");
      return new BrowserAudioGraphContext(new AudioContextConstructor());
    },
  };
}

export function unwrapBrowserAudioNode(port: AudioNodePort): AudioNode {
  if (!(port instanceof BrowserAudioNodePort)) {
    throw new Error("Audio node was not created by the browser audio graph");
  }
  return port.rawNode;
}

export function unwrapBrowserAudioContext(context: AudioGraphContext): AudioContext {
  if (!(context instanceof BrowserAudioGraphContext)) {
    throw new Error("Audio context was not created by the browser audio graph");
  }
  return context.rawContext;
}
