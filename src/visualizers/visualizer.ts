import type { FeatureFrame } from '../core/feature-frame';

/** What a visualizer sees each frame. The renderer computes everything here. */
export interface FrameInput {
  /** Already delayed by lagMs. */
  readonly frame: FeatureFrame;
  /** Seconds since the previous frame. */
  readonly dt: number;
  /** 0..1 decaying onset pulse. Flash-limited to 3/s and 0 with reduced motion. */
  readonly pulse: number;
  /** 0..1 motion intensity (lower with prefers-reduced-motion). */
  readonly intensity: number;
}

/** Writes uniforms by name. Locations are cached by the renderer; nothing allocates. */
export interface Uniforms {
  float(name: string, value: number): void;
  floats(name: string, values: Float32Array): void;
}

/**
 * A visualizer is a shader plus a function that turns features into uniforms. It never touches
 * WebGL: the renderer compiles the program, owns buffers and the frame loop, and always sets
 * `u_res` (vec2, pixels), `u_time` (seconds), `u_pulse` and `u_intensity`.
 */
export interface VisualizerSpec {
  readonly id: string;
  readonly name: string;
  readonly fragmentShader: string;
  /** Defaults to a fullscreen triangle that passes `v_uv`. */
  readonly vertexShader?: string;
  /** Instanced draw: `vertices` per instance, `count` instances. Defaults to the fullscreen triangle. */
  readonly geometry?: { readonly vertices: number; readonly count: number };
  /** Clear colour before drawing; also enables premultiplied alpha blending. */
  readonly background?: readonly [number, number, number];
  /** Onset pulse decay time in seconds. Default 0.2. */
  readonly pulseDecayS?: number;
  /** Called once when the visualizer is selected; the returned function runs every frame. */
  create(): (input: FrameInput, uniforms: Uniforms) => void;
}
