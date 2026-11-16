import fragmentShader from './bars.frag.glsl?raw';
import vertexShader from './bars.vert.glsl?raw';
import type { VisualizerSpec } from './visualizer';

/** 64 log-spaced spectrum bars with a faint reflection: 128 instanced quads. */
export const spectrumBars: VisualizerSpec = {
  id: 'bars',
  name: 'Spectrum bars',
  vertexShader,
  fragmentShader,
  geometry: { vertices: 6, count: 128 },
  background: [0.02, 0.02, 0.04],
  pulseDecayS: 0.15,
  create: () => (input, u) => u.floats('u_spec', input.frame.spectrum),
};
