import { describe, expect, it } from 'vitest';
import { ANALYSIS } from '../../src/core/config';
import { OnsetDetector } from '../../src/core/onset';
import { analyse, clickTrack, SR } from './helpers';

const HOP_S = ANALYSIS.hop / SR;

describe('onset detection', () => {
  it.each([90, 120, 150])('detects every click at %d BPM exactly once', (bpm) => {
    const { signal, onsets } = clickTrack(bpm, 10, 0.5, bpm);
    const detected = analyse(signal)
      .filter((f) => f.onset)
      .map((f) => f.t);
    expect(detected.length).toBe(onsets.length);
    // Frame `t` is the window centre, so a causal detector reports a click a fixed fraction of
    // the window early. The bias is constant (calibration absorbs it); the jitter is within a hop.
    const errors = detected.map((t, i) => t - onsets[i]!);
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    for (const e of errors) expect(Math.abs(e - mean)).toBeLessThanOrEqual(HOP_S);
    expect(Math.abs(mean)).toBeLessThanOrEqual(ANALYSIS.fftSize / 2 / SR);
  });

  it('honours the refractory period', () => {
    const d = new OnsetDetector(HOP_S, { refractoryS: 0.1 });
    for (let i = 0; i < 50; i++) d.process(0.001, i * HOP_S);
    let count = 0;
    for (let i = 50; i < 55; i++) if (d.process(1, i * HOP_S).onset) count++;
    expect(count).toBe(1);
  });

  it('ignores steady noise', () => {
    const d = new OnsetDetector(HOP_S);
    let count = 0;
    for (let i = 0; i < 500; i++) if (d.process(0.005, i * HOP_S).onset) count++;
    expect(count).toBe(0);
  });
});
