import { describe, expect, it } from 'vitest';
import { FFT } from '../../src/core/fft';

describe('FFT', () => {
  it('puts a bin-centred sine into its bin', () => {
    const n = 2048;
    const fft = new FFT(n);
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    const k = 37;
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * k * i) / n);
    fft.forward(re, im);
    const mag = (j: number) => Math.hypot(re[j]!, im[j]!);
    expect(mag(k)).toBeCloseTo(n / 2, 0);
    for (let j = 1; j < n / 2; j++) if (j !== k) expect(mag(j)).toBeLessThan(1e-2 * n);
  });

  it('satisfies Parseval on noise', () => {
    const n = 1024;
    const fft = new FFT(n);
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    let timeE = 0;
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453);
      timeE += re[i]! ** 2;
    }
    fft.forward(re, im);
    let freqE = 0;
    for (let i = 0; i < n; i++) freqE += re[i]! ** 2 + im[i]! ** 2;
    expect(freqE / n).toBeCloseTo(timeE, 1);
  });

  it('rejects non-power-of-two sizes', () => {
    expect(() => new FFT(1000)).toThrow();
  });
});
