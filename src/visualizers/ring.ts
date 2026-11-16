import fragmentShader from './ring.frag.glsl?raw';
import type { VisualizerSpec } from './visualizer';

/** Spectrum around a circle, radius breathing with the bass, core pulsing on onsets. */
export const radialRing: VisualizerSpec = {
  id: 'ring',
  name: 'Radial ring',
  fragmentShader,
  create: () => (input, u) => {
    u.floats('u_spec', input.frame.spectrum);
    u.floats('u_bands', input.frame.bands);
  },
};
