import fragmentShader from './plasma.frag.glsl?raw';
import type { VisualizerSpec } from './visualizer';

/** Centroid on a log scale: 200 Hz -> 0, 6 kHz -> 1. */
const brightness = (centroidHz: number) =>
  Math.min(1, Math.max(0, Math.log(Math.max(centroidHz, 1) / 200) / Math.log(30)));

/** Fullscreen domain-warped noise: flow speed and level from RMS, hue from centroid, pulses. */
export const plasmaShader: VisualizerSpec = {
  id: 'plasma',
  name: 'Plasma shader',
  fragmentShader,
  pulseDecayS: 0.25,
  create: () => {
    let flow = 0;
    let bright = 0;
    return ({ frame: f, dt, intensity }, u) => {
      flow += dt * (0.3 + 1.2 * f.rms * intensity);
      bright += (brightness(f.centroid) - bright) * Math.min(1, dt * 3);
      u.float('u_flow', flow);
      u.float('u_rms', f.rms);
      u.float('u_bright', bright);
      u.float('u_bass', 0.5 * ((f.bands[0] ?? 0) + (f.bands[1] ?? 0)));
    };
  },
};
