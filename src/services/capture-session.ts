import type { TapCalibrator } from '../core/calibrate';
import type { FeatureFrame } from '../core/feature-frame';
import type { LagBuffer } from '../core/lag-buffer';
import { QuietTracker } from '../core/quiet';
import { Store } from '../core/store';
import type { Analyzer } from './analyzer';
import type { Clock } from './audio-context';
import {
  type AudioSource,
  type SourceErrorCode,
  type SourceId,
  toSourceError,
} from './audio-source';
import type { FrameReader } from './renderer';

export type SourceRequest =
  | { readonly id: 'display' }
  | { readonly id: 'microphone'; readonly deviceId: string | null }
  | { readonly id: 'file'; readonly file: Blob & { name?: string } };

export type CaptureError = SourceErrorCode | 'ended';

export type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting'; readonly source: SourceId }
  | { readonly kind: 'running'; readonly source: AudioSource }
  | {
      readonly kind: 'error';
      readonly source: SourceId;
      readonly error: CaptureError;
      readonly detail: string;
    };

export interface SessionState {
  readonly phase: Phase;
  /** RMS below -80 dBFS for 5 s while running. */
  readonly silent: boolean;
}

/** Everything the session touches outside itself. main.ts passes the real ones; tests pass fakes. */
export interface CaptureDeps {
  createContext(): AudioContext;
  createClock(ctx: AudioContext): Clock;
  createAnalyzer(ctx: AudioContext): Promise<Analyzer>;
  createSource(request: SourceRequest): AudioSource;
  lagBuffer: LagBuffer;
  /** Receives every raw (undelayed) onset for tap calibration. */
  calibrator: TapCalibrator;
  /** Current lag in ms. */
  lagMs(): number;
}

const SILENCE_DB = -80;
const SILENCE_S = 5;

/**
 * Owns the capture lifecycle: AudioContext, analyzer, and the active source.
 * Feeds analyzer frames into the lag buffer and the calibrator, and serves delayed frames to the
 * renderer. Knows nothing about the DOM.
 */
export class CaptureSession implements FrameReader {
  readonly state = new Store<SessionState>({ phase: { kind: 'idle' }, silent: false });
  private ctx: AudioContext | null = null;
  private clock: Clock | null = null;
  private analyzer: Promise<Analyzer> | null = null;
  private connected: Analyzer | null = null;
  private source: AudioSource | null = null;
  private token = 0;
  private silentSince: number | null = null;
  private meter = 0;
  private readonly quiet = new QuietTracker();
  private denoise = true;

  constructor(private readonly deps: CaptureDeps) {}

  /** Seconds since anything was heard (by the meter level; see QuietTracker). */
  get quietFor(): number {
    return this.quiet.quietFor;
  }

  /** Latest meter level, 0..1 (denoised when denoise is on; see FeatureFrame.level). */
  get level(): number {
    return this.meter;
  }

  /**
   * Starts (or switches to) a source. Call from a user gesture: the synchronous part creates
   * and resumes the AudioContext before the first await.
   */
  async start(request: SourceRequest): Promise<void> {
    const deps = this.deps;
    if (!this.ctx) {
      this.ctx = deps.createContext();
      this.clock = deps.createClock(this.ctx);
    } else void this.ctx.resume();
    const ctx = this.ctx;
    const token = ++this.token;
    this.disconnect();
    this.state.set({ phase: { kind: 'starting', source: request.id }, silent: false });

    const source = deps.createSource(request);
    this.analyzer ??= this.createAnalyzer(ctx).catch((err: unknown) => {
      this.analyzer = null; // retry loading the worklet next time
      throw err;
    });
    try {
      const [analyzer, node] = await Promise.all([this.analyzer, source.start(ctx)]);
      if (token !== this.token) return source.stop();
      this.connected = analyzer;
      this.source = source;
      deps.lagBuffer.clear();
      deps.calibrator.reset();
      this.silentSince = null;
      this.quiet.reset();
      analyzer.connect(node);
      source.onEnded(() => {
        if (this.source !== source) return;
        this.disconnect();
        this.state.set({ phase: { kind: 'error', source: source.id, error: 'ended', detail: '' } });
      });
      this.state.set({ phase: { kind: 'running', source } });
    } catch (err) {
      source.stop();
      if (token !== this.token) return;
      const e = toSourceError(err);
      this.state.set({
        phase: { kind: 'error', source: request.id, error: e.code, detail: e.message },
      });
    }
  }

  stop(): void {
    this.token++;
    this.disconnect();
    this.state.set({ phase: { kind: 'idle' }, silent: false });
  }

  /** Noise gate on the analysis. Remembered and applied to the analyzer when it exists. */
  setDenoise(on: boolean): void {
    this.denoise = on;
    void this.analyzer?.then((a) => a.setDenoise(on)).catch(() => {});
  }

  /** Audio-clock time for a performance-clock timestamp, or null before the first start. */
  audioTime(perfMs: number): number | null {
    return this.clock?.fromPerf(perfMs) ?? null;
  }

  poll(): void {
    this.connected?.poll();
  }

  read(out: FeatureFrame): boolean {
    if (!this.clock || this.state.get().phase.kind === 'idle') return false;
    return this.deps.lagBuffer.read(this.clock.now() - this.deps.lagMs() / 1000, out);
  }

  private async createAnalyzer(ctx: AudioContext): Promise<Analyzer> {
    const analyzer = await this.deps.createAnalyzer(ctx);
    analyzer.onFrame((f) => this.onFrame(f));
    analyzer.setDenoise(this.denoise);
    return analyzer;
  }

  private onFrame(f: FeatureFrame): void {
    this.deps.lagBuffer.push(f);
    if (f.onset) this.deps.calibrator.addOnset(f.t);
    this.meter = f.level;
    this.quiet.update(f.level, f.t);
    if (f.levelDb >= SILENCE_DB) this.silentSince = null;
    else this.silentSince ??= f.t;
    const silent = this.silentSince !== null && f.t - this.silentSince >= SILENCE_S;
    if (silent !== this.state.get().silent) this.state.set({ silent });
  }

  private disconnect(): void {
    this.connected?.disconnect();
    this.source?.stop();
    this.source = null;
  }
}
