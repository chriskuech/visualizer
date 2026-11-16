import { describe, expect, it } from 'vitest';
import { ANALYSIS } from '../../src/core/config';
import { NoiseGate } from '../../src/core/denoise';
import type { FeatureFrame } from '../../src/core/feature-frame';
import { analyse, rng, SR } from './helpers';

/** White noise throughout; from 2 s, a melody (new note every 250 ms) and clicks at 120 BPM. */
const MELODY = [880, 988, 1047, 1175, 1047, 988];

function noisyMusic(seconds: number, noiseAmp: number, seed = 1) {
  const r = rng(seed);
  const s = new Float32Array(seconds * SR);
  const clicks: number[] = [];
  for (let t = 2; t < seconds - 0.1; t += 0.5) clicks.push(t);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const freq = MELODY[Math.floor(t / 0.25) % MELODY.length]!;
    const tone = t >= 2 ? 0.3 * Math.sin(2 * Math.PI * freq * t) : 0;
    s[i] = (r() * 2 - 1) * noiseAmp + tone;
  }
  for (const c of clicks) {
    const start = Math.round(c * SR);
    for (let i = 0; i < 0.03 * SR; i++)
      s[start + i]! += (r() * 2 - 1) * 0.8 * Math.exp(-i / (0.005 * SR));
  }
  return { signal: s, clicks };
}

/** Mean absolute frame-to-frame change of every spectrum bar between `fromS` and `toS`. */
function jitter(frames: FeatureFrame[], fromS: number, toS: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i]!.t < fromS || frames[i]!.t > toS) continue;
    for (let b = 0; b < ANALYSIS.spectrumBins; b++) {
      sum += Math.abs(frames[i]!.spectrum[b]! - frames[i - 1]!.spectrum[b]!);
      n++;
    }
  }
  return sum / n;
}

/** Noise only, after the floor has converged. */
const noiseFrames = (frames: FeatureFrame[]) => frames.filter((f) => f.t > 0.5 && f.t < 1.9);
/** Noise plus melody. */
const musicFrames = (frames: FeatureFrame[]) => frames.filter((f) => f.t > 2.5);

describe('NoiseGate', () => {
  it('learns a steady floor, gates it to 0 and keeps what rises above it', () => {
    const gate = new NoiseGate(2, 0.01);
    for (let i = 0; i < 200; i++) gate.process(Float32Array.of(0.5, 0.5));
    const v = Float32Array.of(0.5, 0.9);
    gate.process(v);
    expect(v[0]).toBe(0);
    expect(v[1]!).toBeGreaterThan(0.3);
  });

  it('keeps learning when not applied', () => {
    const gate = new NoiseGate(1, 0.01);
    const v = Float32Array.of(0.5);
    for (let i = 0; i < 200; i++) gate.process(v, false);
    expect(v[0]).toBe(0.5);
    gate.process(v, true);
    expect(v[0]).toBe(0);
  });
});

describe('denoise warm-up', () => {
  it('settles on the room within ~2 s even after a silent start (mic warm-up)', () => {
    const r = rng(9);
    const s = new Float32Array(5 * SR);
    // 0.5 s of digital silence, then steady noise.
    for (let i = Math.round(0.5 * SR); i < s.length; i++) s[i] = (r() * 2 - 1) * 0.05;
    const frames = analyse(s, SR, true, true).filter((f) => f.t > 2.5);
    const mean =
      frames.reduce((a, f) => a + f.spectrum.reduce((x, y) => x + y, 0) / 64, 0) / frames.length;
    expect(mean).toBeLessThan(0.01);
    expect(frames.filter((f) => f.onset)).toHaveLength(0);
  });

  it('stays dark while it is still learning the room at start-up', () => {
    const r = rng(11);
    const s = new Float32Array(3 * SR);
    for (let i = 0; i < s.length; i++) s[i] = (r() * 2 - 1) * 0.05;
    const frames = analyse(s, SR, true, true);
    expect(Math.max(...frames.flatMap((f) => [...f.spectrum]))).toBeLessThan(0.05);
    expect(frames.filter((f) => f.onset)).toHaveLength(0);
  });

  it('keeps the learned floor through a pause in the signal', () => {
    const r = rng(10);
    const s = new Float32Array(8 * SR);
    for (let i = 0; i < s.length; i++) {
      const t = i / SR;
      s[i] = t > 4 && t < 5 ? 0 : (r() * 2 - 1) * 0.05; // 1 s of digital silence mid-way
    }
    const after = analyse(s, SR, true, true).filter((f) => f.t > 5.2 && f.t < 6);
    const mean =
      after.reduce((a, f) => a + f.spectrum.reduce((x, y) => x + y, 0) / 64, 0) / after.length;
    expect(mean).toBeLessThan(0.01);
  });
});

describe('denoise in the feature pipeline', () => {
  const { signal, clicks } = noisyMusic(8, 0.05);
  const raw = analyse(signal, SR, true, false);
  const clean = analyse(signal, SR, true, true);

  it('makes the noise-only part of the spectrum far less jittery', () => {
    const before = jitter(raw, 0.5, 1.9);
    const after = jitter(clean, 0.5, 1.9);
    expect(after).toBeLessThan(before * 0.1);
  });

  it('darkens noise-only bars but keeps the tone', () => {
    const top = (fs: FeatureFrame[]) => fs.reduce((a, f) => a + f.spectrum[60]!, 0) / fs.length;
    expect(top(noiseFrames(clean))).toBeLessThan(0.05);
    expect(top(noiseFrames(raw))).toBeGreaterThan(0.3);
    // The melody's loudest bar stays bright.
    const music = musicFrames(clean);
    const melodyPeak = music.reduce((a, f) => a + Math.max(...f.spectrum), 0) / music.length;
    expect(melodyPeak).toBeGreaterThan(0.5);
  });

  it('still finds every click, with no false onsets in the noise', () => {
    const onsets = clean.filter((f) => f.onset).map((f) => f.t);
    const hop = ANALYSIS.hop / SR;
    for (const c of clicks) expect(onsets.some((o) => Math.abs(o - c) <= 2.5 * hop)).toBe(true);
    expect(onsets.filter((t) => t > 0.3 && t < 1.95)).toHaveLength(0);
  });

  it('reports loudness near 0 for noise alone, and keeps it for music', () => {
    const avgRms = (fs: FeatureFrame[]) => fs.reduce((a, f) => a + f.rms, 0) / fs.length;
    expect(avgRms(noiseFrames(raw))).toBeGreaterThan(0.5); // auto-gain boosts plain noise
    expect(avgRms(noiseFrames(clean))).toBeLessThan(0.05);
    expect(avgRms(musicFrames(clean))).toBeGreaterThan(0.3);
  });

  it('meters noise alone at 0 and keeps music on the meter', () => {
    const avg = (fs: FeatureFrame[]) => fs.reduce((a, f) => a + f.level, 0) / fs.length;
    expect(avg(noiseFrames(raw))).toBeGreaterThan(0.3); // raw meter shows the hiss
    expect(avg(noiseFrames(clean))).toBeLessThan(0.02);
    expect(avg(musicFrames(clean))).toBeGreaterThan(0.3);
  });

  it('leaves the raw level untouched', () => {
    const at = (fs: FeatureFrame[]) => fs.at(-1)!.levelDb;
    expect(at(clean)).toBeCloseTo(at(raw), 6);
  });
});
