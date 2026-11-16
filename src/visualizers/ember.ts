import fragmentShader from './ember.frag.glsl?raw';
import type { VisualizerSpec } from './visualizer';

/** Seconds over which the audio is smoothed: the scene swells and settles, never jumps. */
const SMOOTH_S = 2.5;

/**
 * For falling asleep with the TV on: dim deep-red ribbons drifting slowly. No blue, a low
 * brightness cap, heavily smoothed audio, and onset pulses ignored (no flashes).
 */
export const ember: VisualizerSpec = {
  id: 'ember',
  name: 'Ember (sleep)',
  fragmentShader,
  create: () => {
    let drift = 0;
    let level = 0;
    let low = 0;
    let mid = 0;
    return ({ frame: f, dt, intensity }, u) => {
      const k = 1 - Math.exp(-dt / SMOOTH_S);
      level += (f.rms - level) * k;
      low += (0.5 * ((f.bands[0] ?? 0) + (f.bands[1] ?? 0)) - low) * k;
      mid += ((f.bands[3] ?? 0) - mid) * k;
      // Slow either way; a little livelier when there is sound. Slower still with reduced motion.
      drift += dt * (0.35 + 0.25 * level) * (0.5 + 0.5 * intensity);
      u.float('u_drift', drift);
      u.float('u_level', level);
      u.float('u_low', low);
      u.float('u_mid', mid);
    };
  },
};
