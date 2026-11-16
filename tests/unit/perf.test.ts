import { expect, it } from 'vitest';
import { ANALYSIS } from '../../src/core/config';
import { createFrame } from '../../src/core/feature-frame';
import { FeatureExtractor } from '../../src/core/features';

it('processes a hop well under 25% of the hop duration', () => {
  const ex = new FeatureExtractor(48000);
  const frame = createFrame();
  const win = new Float32Array(ANALYSIS.fftSize).map((_, i) => Math.sin(i * 0.05));
  for (let i = 0; i < 200; i++) ex.process(win, i, frame); // warm up
  const n = 2000;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) ex.process(win, i, frame);
  const perHopMs = (performance.now() - t0) / n;
  const hopMs = (ANALYSIS.hop / 48000) * 1000;
  console.log(`feature extraction: ${(perHopMs * 1000).toFixed(1)} µs per hop`);
  expect(perHopMs).toBeLessThan(hopMs * 0.25);
});
