import { createFrame, type FeatureFrame } from '../core/feature-frame';
import { FlashLimiter, Pulse } from '../core/flash';
import type { FrameInput, Uniforms, VisualizerSpec } from '../visualizers/visualizer';
import type { MotionPreference } from './motion';

const FULLSCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Where the renderer gets delayed frames. */
export interface FrameReader {
  /** Called first every animation frame (main-thread analysis runs here). */
  poll(): void;
  /** Writes the delayed frame into `out`; false when there is no data yet. */
  read(out: FeatureFrame): boolean;
}

export interface RenderTick {
  fps: number;
  /** An onset crossed this frame, before flash limiting. */
  onset: boolean;
}

export interface RendererDeps {
  frames: FrameReader;
  motion: MotionPreference;
}

interface Program {
  spec: VisualizerSpec;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  locations: Map<string, WebGLUniformLocation | null>;
  update: (input: FrameInput, u: Uniforms) => void;
  pulse: Pulse;
  time: number;
}

/**
 * Owns the canvas, the WebGL2 context and the requestAnimationFrame loop. Each frame it reads the
 * delayed features, applies the flash limit and motion preference, and draws the active
 * visualizer spec. Visualizers never see WebGL.
 */
export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private active: Program | null = null;
  private readonly frame = createFrame();
  private readonly limiter = new FlashLimiter(3);
  private readonly input: { -readonly [K in keyof FrameInput]: FrameInput[K] };
  private readonly tick: RenderTick = { fps: 60, onset: false };
  private readonly uniforms: Uniforms;
  private width = 1;
  private height = 1;
  private renderScale = 1;
  private last = 0;
  private running = false;
  private tickListener: (tick: RenderTick) => void = () => {};

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: RendererDeps,
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.input = { frame: this.frame, dt: 0, pulse: 0, intensity: 1 };
    this.uniforms = {
      float: (name, v) => gl.uniform1f(this.location(name), v),
      floats: (name, v) => gl.uniform1fv(this.location(name), v),
    };
    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('fullscreenchange', () => this.resize());
    this.resize();
  }

  /** Called after every drawn frame. */
  onTick(cb: (tick: RenderTick) => void): void {
    this.tickListener = cb;
  }

  setRenderScale(scale: number): void {
    this.renderScale = scale;
    this.resize();
  }

  setVisualizer(spec: VisualizerSpec): void {
    const gl = this.gl;
    if (this.active) {
      gl.deleteProgram(this.active.program);
      gl.deleteVertexArray(this.active.vao);
    }
    this.active = {
      spec,
      program: compile(gl, spec.vertexShader ?? FULLSCREEN_VS, spec.fragmentShader),
      vao: gl.createVertexArray(),
      locations: new Map(),
      update: spec.create(),
      pulse: new Pulse(spec.pulseDecayS ?? 0.2),
      time: 0,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private location(name: string): WebGLUniformLocation | null {
    const p = this.active!;
    let loc = p.locations.get(name);
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(p.program, name);
      p.locations.set(name, loc);
    }
    return loc;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.width && h === this.height) return;
    this.canvas.width = this.width = w;
    this.canvas.height = this.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  private readonly loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (dt > 0) this.tick.fps += (1 / dt - this.tick.fps) * 0.05;
    this.deps.frames.poll();
    // Pause drawing (not analysis) while hidden.
    if (document.visibilityState === 'hidden' || !this.active) return;

    const f = this.frame;
    if (!this.deps.frames.read(f)) silence(f);
    const motion = this.deps.motion;
    this.tick.onset = f.onset;
    // Full-frame pulses: at most 3 per second, none with reduced motion.
    f.onset = f.onset && !motion.reduced && this.limiter.allow(now / 1000);

    const p = this.active;
    p.time += dt;
    this.input.dt = dt;
    this.input.pulse = p.pulse.update(f.onset, f.onsetStrength, dt);
    this.input.intensity = motion.intensity;
    this.draw(p);
    this.tickListener(this.tick);
  };

  private draw(p: Program): void {
    const gl = this.gl;
    const { spec } = p;
    if (spec.background) {
      gl.clearColor(spec.background[0], spec.background[1], spec.background[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.useProgram(p.program);
    gl.bindVertexArray(p.vao);
    gl.uniform2f(this.location('u_res'), this.width, this.height);
    gl.uniform1f(this.location('u_time'), p.time);
    gl.uniform1f(this.location('u_pulse'), this.input.pulse);
    gl.uniform1f(this.location('u_intensity'), this.input.intensity);
    p.update(this.input, this.uniforms);
    if (spec.geometry)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, spec.geometry.vertices, spec.geometry.count);
    else gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (spec.background) gl.disable(gl.BLEND);
  }
}

function silence(f: FeatureFrame): void {
  f.rms = 0;
  f.peak = 0;
  f.bands.fill(0);
  f.spectrum.fill(0);
  f.onset = false;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram();
  const v = shader(gl.VERTEX_SHADER, vs);
  const f = shader(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(`Link failed: ${gl.getProgramInfoLog(p)}`);
  return p;
}
