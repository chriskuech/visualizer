import { spectrumBars } from './bars';
import { ember } from './ember';
import { plasmaShader } from './plasma';
import { radialRing } from './ring';
import type { VisualizerSpec } from './visualizer';

/** In picker order; keys 1..n select them. */
export const VISUALIZERS: readonly VisualizerSpec[] = [
  spectrumBars,
  radialRing,
  plasmaShader,
  ember,
];

export const findVisualizer = (id: string): VisualizerSpec =>
  VISUALIZERS.find((v) => v.id === id) ?? VISUALIZERS[0]!;
