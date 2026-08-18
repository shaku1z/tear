import { describe, expect, it, vi } from "vitest";

import { createBrowserAudioContextHandoff } from "../../src/audio/audio-context-handoff";

describe("browser audio-context handoff", () => {
  it("captures one context per supplied composition handoff and releases only its own context", async () => {
    const firstClose = vi.fn().mockResolvedValue(undefined);
    const secondClose = vi.fn().mockResolvedValue(undefined);
    const firstContext = {
      state: "running", resume: vi.fn().mockResolvedValue(undefined), close: firstClose,
    } as unknown as AudioContext;
    const secondContext = {
      state: "running", resume: vi.fn().mockResolvedValue(undefined), close: secondClose,
    } as unknown as AudioContext;
    const FirstAudioContext = vi.fn(function FirstAudioContext() { return firstContext; });
    const SecondAudioContext = vi.fn(function SecondAudioContext() { return secondContext; });
    const first = createBrowserAudioContextHandoff({ AudioContext: FirstAudioContext } as unknown as Window);
    const second = createBrowserAudioContextHandoff({ AudioContext: SecondAudioContext } as unknown as Window);

    expect(first.capture()).toBe(firstContext);
    expect(first.capture()).toBe(firstContext);
    expect(second.captured()).toBeNull();
    expect(FirstAudioContext).toHaveBeenCalledOnce();
    expect(second.capture()).toBe(secondContext);
    first.dispose();
    await Promise.resolve();

    expect(first.captured()).toBeNull();
    expect(second.captured()).toBe(secondContext);
    expect(firstClose).toHaveBeenCalledOnce();
    expect(secondClose).not.toHaveBeenCalled();
  });
});
