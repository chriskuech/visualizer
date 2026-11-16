import { ANALYSIS } from '../../src/core/config';
import type { FeatureFrame } from '../../src/core/feature-frame';
import { copyFrame, createFrame } from '../../src/core/feature-frame';
import { FeatureExtractor } from '../../src/core/features';
import { HopCollector } from '../../src/core/hop-collector';

export const SR = 48000;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(r: () => number): number {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Runs the full pipeline over a signal in 128-sample quanta, as the worklet does. */
export function analyse(
  signal: Float32Array,
  sampleRate = SR,
  autoGain = true,
  denoise = false,
): FeatureFrame[] {
  const ex = new FeatureExtractor(sampleRate, ANALYSIS.hop, { autoGain, denoise });
  const frame = createFrame();
  const out: FeatureFrame[] = [];
  const hc = new HopCollector(ANALYSIS.fftSize, ANALYSIS.hop, (win, end) => {
    ex.process(win, (end - ANALYSIS.fftSize / 2) / sampleRate, frame);
    const copy = createFrame();
    copyFrame(frame, copy);
    out.push(copy);
  });
  for (let i = 0; i < signal.length; i += 128) hc.push(signal.subarray(i, i + 128), i);
  return out;
}

export function sine(freq: number, seconds: number, amp = 0.5, sampleRate = SR): Float32Array {
  const s = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < s.length; i++) s[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return s;
}

/** Click track: short decaying noise bursts at `bpm`, starting at `offsetS`. */
export function clickTrack(bpm: number, seconds: number, offsetS = 0.5, seed = 1) {
  const r = rng(seed);
  const s = new Float32Array(Math.round(seconds * SR));
  const period = 60 / bpm;
  const onsets: number[] = [];
  for (let t = offsetS; t < seconds - 0.1; t += period) {
    onsets.push(t);
    const start = Math.round(t * SR);
    for (let i = 0; i < 0.03 * SR && start + i < s.length; i++)
      s[start + i] = (r() * 2 - 1) * 0.8 * Math.exp(-i / (0.005 * SR));
  }
  // Light background noise so the threshold is not trivially zero.
  for (let i = 0; i < s.length; i++) s[i]! += (r() * 2 - 1) * 0.001;
  return { signal: s, onsets };
}
