import { ANALYSIS, PROCESSOR_NAME } from '../core/config';
import { createFrame, type FeatureFrame, FRAME_STRIDE, unpackFrame } from '../core/feature-frame';
import { FeatureExtractor } from '../core/features';
import processorUrl from './feature-processor.ts?worker&url';

export type FrameListener = (f: FeatureFrame) => void;

/** Turns an audio node into a stream of undelayed FeatureFrames. */
export interface Analyzer {
  readonly mode: 'worklet' | 'main-thread';
  connect(node: AudioNode): void;
  disconnect(): void;
  /** Called once per animation frame. Only the main-thread analyzer does work here. */
  poll(): void;
  onFrame(cb: FrameListener): void;
  /** Turns the noise gate on or off (see FeatureExtractor.denoise). */
  setDenoise(on: boolean): void;
}

/**
 * Some browsers do not process a node that is not connected to the destination, so the analysis
 * node goes through a zero-gain node into ctx.destination. Nothing audible reaches the output.
 */
function silentSink(ctx: AudioContext): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(ctx.destination);
  return g;
}

/** Phase 2: features computed on the audio thread, timed by the audio clock. */
export class WorkletAnalyzer implements Analyzer {
  readonly mode = 'worklet' as const;
  private readonly node: AudioWorkletNode;
  private readonly frame = createFrame();
  private listener: FrameListener = () => {};
  private input: AudioNode | null = null;

  private constructor(ctx: AudioContext) {
    this.node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.connect(silentSink(ctx));
    this.node.port.onmessage = (
      e: MessageEvent<{ type: 'frames'; data: Float64Array; count: number }>,
    ) => {
      const { data, count } = e.data;
      for (let i = 0; i < count; i++) {
        unpackFrame(data, i * FRAME_STRIDE, this.frame);
        this.listener(this.frame);
      }
    };
  }

  /** Loads the worklet module. Call after the AudioContext was created in a user gesture. */
  static async create(ctx: AudioContext): Promise<WorkletAnalyzer> {
    await ctx.audioWorklet.addModule(processorUrl);
    return new WorkletAnalyzer(ctx);
  }

  setDenoise(on: boolean): void {
    this.node.port.postMessage({ type: 'config', denoise: on });
  }

  connect(node: AudioNode): void {
    this.disconnect();
    node.connect(this.node);
    this.input = node;
  }

  disconnect(): void {
    try {
      this.input?.disconnect(this.node);
    } catch {
      // not connected
    }
    this.input = null;
  }

  poll(): void {}

  onFrame(cb: FrameListener): void {
    this.listener = cb;
  }
}

/** Phase 1: AnalyserNode sampled once per animation frame on the main thread. */
export class MainThreadAnalyzer implements Analyzer {
  readonly mode = 'main-thread' as const;
  private readonly analyser: AnalyserNode;
  private readonly samples = new Float32Array(ANALYSIS.fftSize);
  private readonly extractor: FeatureExtractor;
  private readonly frame = createFrame();
  private listener: FrameListener = () => {};
  private input: AudioNode | null = null;
  private lastTime = -1;

  constructor(private readonly ctx: AudioContext) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = ANALYSIS.fftSize;
    this.analyser.smoothingTimeConstant = 0;
    this.analyser.connect(silentSink(ctx));
    // One "hop" per display frame at 60 Hz.
    this.extractor = new FeatureExtractor(ctx.sampleRate, Math.round(ctx.sampleRate / 60));
  }

  setDenoise(on: boolean): void {
    this.extractor.denoise = on;
  }

  connect(node: AudioNode): void {
    this.disconnect();
    node.connect(this.analyser);
    this.input = node;
  }

  disconnect(): void {
    try {
      this.input?.disconnect(this.analyser);
    } catch {
      // not connected
    }
    this.input = null;
  }

  poll(): void {
    if (!this.input) return;
    const now = this.ctx.currentTime;
    if (now === this.lastTime) return; // no new audio since the last poll
    this.lastTime = now;
    this.analyser.getFloatTimeDomainData(this.samples);
    const centre = now - ANALYSIS.fftSize / 2 / this.ctx.sampleRate;
    this.extractor.process(this.samples, centre, this.frame);
    this.listener(this.frame);
  }

  onFrame(cb: FrameListener): void {
    this.listener = cb;
  }
}
