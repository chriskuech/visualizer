import { describe, expect, it } from 'vitest';
import { ANALYSIS } from '../../src/core/config';
import { analyse, rng, SR, sine } from './helpers';

const argmax = (a: Float32Array) => a.reduce((best, v, i) => (v > a[best]! ? i : best), 0);
const bandOf = (f: number) =>
  Math.floor((Math.log(f / ANALYSIS.fMin) / Math.log(ANALYSIS.fMax / ANALYSIS.fMin)) * 8);

describe('FeatureExtractor', () => {
  it('produces about 94 frames per second at 48 kHz', () => {
    const frames = analyse(sine(440, 2));
    expect(frames.length).toBeGreaterThan(180);
    expect(frames.length).toBeLessThan(190);
    const dt = frames[1]!.t - frames[0]!.t;
    expect(dt).toBeCloseTo(512 / SR, 6);
  });

  it.each([40, 100, 300, 1000, 3000, 6000, 12000])('maps a %d Hz sine to its band', (f) => {
    const frames = analyse(sine(f, 1), SR, false);
    const last = frames.at(-1)!;
    expect(argmax(last.bands)).toBe(bandOf(f));
    if (f >= 100) expect(last.centroid).toBeGreaterThan(f * 0.8);
    if (f >= 100) expect(last.centroid).toBeLessThan(f * 1.25);
  });

  it('follows a sine sweep upward through the bands', () => {
    const seconds = 4;
    const s = new Float32Array(seconds * SR);
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      const f = 50 * (10000 / 50) ** (i / s.length);
      phase += (2 * Math.PI * f) / SR;
      s[i] = 0.5 * Math.sin(phase);
    }
    const frames = analyse(s, SR, false);
    const picks = [0.1, 0.35, 0.6, 0.85].map((p) =>
      argmax(frames[Math.floor(p * frames.length)]!.bands),
    );
    for (let i = 1; i < picks.length; i++) expect(picks[i]!).toBeGreaterThan(picks[i - 1]!);
  });

  it('fills every band with white noise and keeps values in 0..1', () => {
    const r = rng(7);
    const s = new Float32Array(SR);
    for (let i = 0; i < s.length; i++) s[i] = (r() * 2 - 1) * 0.3;
    const last = analyse(s).at(-1)!;
    for (const v of last.bands) {
      expect(v).toBeGreaterThan(0.3);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const v of last.spectrum) expect(v).toBeLessThanOrEqual(1);
    expect(last.rms).toBeGreaterThan(0.5);
    expect(last.levelDb).toBeLessThan(-10);
  });

  it('auto-gains quiet input to fill the range', () => {
    const loud = analyse(sine(1000, 1, 0.5)).at(-1)!;
    const quiet = analyse(sine(1000, 1, 0.005)).at(-1)!;
    expect(quiet.levelDb).toBeLessThan(loud.levelDb - 35);
    expect(quiet.bands[bandOf(1000)]!).toBeGreaterThan(0.9);
  });

  it('reports silence as dark with a very low level', () => {
    const last = analyse(new Float32Array(SR)).at(-1)!;
    expect(last.levelDb).toBeLessThan(-80);
    for (const v of last.bands) expect(v).toBe(0);
    expect(last.onset).toBe(false);
  });
});
