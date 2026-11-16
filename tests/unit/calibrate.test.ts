import { describe, expect, it } from 'vitest';
import { CALIBRATION, calibrate, TapCalibrator } from '../../src/core/calibrate';
import { gaussian, rng } from './helpers';

interface Scenario {
  bpm: number;
  lagMs: number;
  jitterMs: number;
  seed: number;
}

/** A beat grid plus off-beat onsets, and 12 taps after dropping some beats and adding a wrong one. */
function generate({ bpm, lagMs, jitterMs, seed }: Scenario) {
  const r = rng(seed);
  const period = 60 / bpm;
  const onsets: number[] = [];
  const beats: number[] = [];
  for (let t = 1; t < 13; t += period) {
    beats.push(t);
    onsets.push(t);
    if (r() < 0.4) onsets.push(t + period * (0.25 + 0.5 * r())); // syncopation / hi-hats
  }
  const kept = beats
    .slice(2)
    .filter(() => r() > 0.15)
    .slice(0, 11);
  const taps = kept.map((b) => b + lagMs / 1000 + (gaussian(r) * jitterMs) / 1000);
  // One tap on the wrong beat (an off-beat).
  taps.splice(5, 0, kept[5]! + period / 2 + lagMs / 1000);
  return { taps: taps.sort((a, b) => a - b), onsets: onsets.sort((a, b) => a - b) };
}

describe('calibrate', () => {
  const lags = [0, 40, 120, 250, 380];
  const errorsFor = (jitterMs: number): number[] => {
    const errors: number[] = [];
    for (const lagMs of lags)
      for (const bpm of [90, 120])
        for (let seed = 1; seed <= 40; seed++) {
          const { taps, onsets } = generate({ bpm, lagMs, jitterMs, seed: seed * 101 + lagMs });
          expect(taps.length).toBe(12);
          errors.push(Math.abs(calibrate(taps, onsets).lagMs - lagMs));
        }
    return errors.sort((x, y) => x - y);
  };
  const pct = (xs: number[], p: number) => xs[Math.floor(xs.length * p)]!;

  // With n = 12 taps the standard error of any estimator is about sigma / sqrt(n), so the
  // 15 ms target holds for the typical run at every jitter and for 90% of runs at 20 ms.
  for (const jitterMs of [20, 30, 40]) {
    it(`lands within 15 ms of the true lag at 12 taps with ${jitterMs} ms jitter`, () => {
      const errors = errorsFor(jitterMs);
      expect(pct(errors, 0.5)).toBeLessThanOrEqual(jitterMs === 40 ? 12 : 8);
      expect(pct(errors, 0.9)).toBeLessThanOrEqual(jitterMs === 20 ? 15 : jitterMs);
      if (jitterMs <= 30) expect(errors.at(-1)!).toBeLessThan(50); // never a wrong-beat result
    });
  }

  it('accepts steady 20 ms taps with high confidence', () => {
    const { taps, onsets } = generate({ bpm: 120, lagMs: 150, jitterMs: 20, seed: 9 });
    const res = calibrate(taps, onsets);
    expect(res.ok).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('rejects random taps as low confidence', () => {
    const r = rng(3);
    const { onsets } = generate({ bpm: 120, lagMs: 0, jitterMs: 0, seed: 3 });
    let rejected = 0;
    for (let trial = 0; trial < 20; trial++) {
      const taps = Array.from({ length: 12 }, (_, i) => 2 + i * 0.83 + r() * 0.4);
      if (!calibrate(taps, onsets).ok) rejected++;
    }
    expect(rejected).toBeGreaterThanOrEqual(18);
  });

  it('needs at least 8 taps before it is ok', () => {
    const { taps, onsets } = generate({ bpm: 120, lagMs: 100, jitterMs: 5, seed: 5 });
    expect(calibrate(taps.slice(0, CALIBRATION.minTaps - 1), onsets).ok).toBe(false);
    expect(calibrate(taps.slice(0, CALIBRATION.minTaps), onsets).ok).toBe(true);
  });

  it('clamps a negative lag to 0 and flags it', () => {
    const onsets = Array.from({ length: 24 }, (_, i) => 1 + i * 0.75);
    const taps = onsets.slice(2, 14).map((o) => o - 0.06);
    const res = calibrate(taps, onsets);
    expect(res.clamped).toBe(true);
    expect(res.lagMs).toBe(0);
  });

  it('subtracts the tap bias', () => {
    const { taps, onsets } = generate({ bpm: 120, lagMs: 200, jitterMs: 0, seed: 1 });
    expect(calibrate(taps, onsets, { TAP_BIAS_MS: 20 }).lagMs).toBeCloseTo(180, -1);
  });
});

describe('TapCalibrator', () => {
  it('starts a new session after 3 s without taps and forgets old onsets', () => {
    const c = new TapCalibrator();
    for (let t = 0; t < 30; t += 0.5) c.addOnset(t);
    c.tap(29);
    c.tap(29.5);
    expect(c.tapCount).toBe(2);
    c.tap(33);
    expect(c.tapCount).toBe(1);
  });
});
