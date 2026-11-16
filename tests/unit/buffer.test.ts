import { describe, expect, it } from 'vitest';
import { createFrame } from '../../src/core/feature-frame';
import { LagBuffer } from '../../src/core/lag-buffer';

const HOP = 512 / 48000;

function filled(onsetEvery = 0) {
  const buf = new LagBuffer(256);
  const f = createFrame();
  for (let i = 0; i < 200; i++) {
    f.t = i * HOP;
    f.rms = i / 200;
    f.bands.fill(i / 200);
    f.onset = onsetEvery > 0 && i % onsetEvery === 0 && i > 0;
    f.onsetStrength = f.onset ? 0.5 : 0;
    buf.push(f);
  }
  return buf;
}

describe('LagBuffer', () => {
  it('interpolates continuous values between neighbouring frames', () => {
    const buf = filled();
    const out = createFrame();
    expect(buf.read(10.5 * HOP, out)).toBe(true);
    expect(out.rms).toBeCloseTo(10.5 / 200, 6);
    expect(out.bands[3]).toBeCloseTo(10.5 / 200, 6);
  });

  it('clamps reads outside the buffered range', () => {
    const buf = filled();
    const out = createFrame();
    buf.read(-1, out);
    expect(out.rms).toBe(0);
    buf.read(1000, out);
    expect(out.rms).toBeCloseTo(199 / 200, 6);
  });

  it('keeps only the newest frames when full', () => {
    const buf = new LagBuffer(4);
    const f = createFrame();
    for (let i = 0; i < 10; i++) {
      f.t = i;
      f.rms = i;
      buf.push(f);
    }
    const out = createFrame();
    buf.read(0, out);
    expect(out.rms).toBe(6);
  });

  it('fires each onset exactly once as the target sweeps', () => {
    const buf = filled(20);
    const out = createFrame();
    let fired = 0;
    for (let t = 0; t < 200 * HOP; t += 1 / 144) {
      buf.read(t, out);
      if (out.onset) fired++;
    }
    expect(fired).toBe(9);
  });

  it('does not refire onsets when lag increases mid-stream, and skips none when it decreases', () => {
    const buf = filled(20);
    const out = createFrame();
    let fired = 0;
    const step = 1 / 60;
    let now = 0;
    let lag = 0;
    while (now < 200 * HOP + 0.5) {
      if (Math.abs(now - 0.8) < step / 2) lag = 0.5; // jump back in time
      if (Math.abs(now - 1.6) < step / 2) lag = 0.1; // jump forward
      buf.read(now - lag, out);
      fired += buf.crossedOnsets;
      now += step;
    }
    expect(fired).toBe(9);
  });

  it('returns false when empty', () => {
    expect(new LagBuffer().read(0, createFrame())).toBe(false);
  });
});
