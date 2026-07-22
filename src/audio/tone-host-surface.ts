import { FeedbackDelay } from "tone/build/esm/effect/FeedbackDelay.js";
import { Distortion } from "tone/build/esm/effect/Distortion.js";
import { MetalSynth } from "tone/build/esm/instrument/MetalSynth.js";
import { MembraneSynth } from "tone/build/esm/instrument/MembraneSynth.js";
import { MonoSynth } from "tone/build/esm/instrument/MonoSynth.js";
import { NoiseSynth } from "tone/build/esm/instrument/NoiseSynth.js";
import { PolySynth } from "tone/build/esm/instrument/PolySynth.js";
import { Synth } from "tone/build/esm/instrument/Synth.js";
import { Filter } from "tone/build/esm/component/filter/Filter.js";
import { Limiter } from "tone/build/esm/component/dynamics/Limiter.js";
import { Context } from "tone/build/esm/core/context/Context.js";
import { Gain } from "tone/build/esm/core/context/Gain.js";
import { getContext, setContext, start } from "tone/build/esm/core/Global.js";

/** Tone's eager root module creates a second AudioContext. This narrow
 * ESM surface defers every global-context read until TearScore installs the
 * AudioSystem-owned context through setContext(). */
const Transport = {
  get position() { return getContext().transport.position; },
  get ticks() { return getContext().transport.ticks; },
  get bpm() { return getContext().transport.bpm; },
  get state() { return getContext().transport.state; },
  start(time?: string | number, offset?: string | number): void {
    getContext().transport.start(time, offset);
  },
  pause(time?: string | number): void { getContext().transport.pause(time); },
  stop(time?: string | number): void { getContext().transport.stop(time); },
  schedule(callback: (time: number) => void, time: string | number): number {
    return getContext().transport.schedule(callback, time);
  },
  scheduleOnce(callback: (time: number) => void, time: string | number): number {
    return getContext().transport.scheduleOnce(callback, time);
  },
  scheduleRepeat(callback: (time: number) => void, interval: string | number): number {
    return getContext().transport.scheduleRepeat(callback, interval);
  },
  clear(eventId: number): void { getContext().transport.clear(eventId); },
};

function now(): number { return getContext().now(); }

export {
  Context, Distortion, FeedbackDelay, Filter, Gain, Limiter,
  MembraneSynth, MetalSynth, MonoSynth, NoiseSynth, PolySynth, Synth,
  Transport, now, setContext, start,
};
