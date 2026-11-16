/// AudioWorkletProcessor that runs the feature pipeline on the audio thread (phase 2).
/// Timing follows the audio clock, so onset timestamps are sample-accurate.
import { ANALYSIS, PROCESSOR_NAME } from '../core/config';
import { createFrame, FRAME_STRIDE, packFrame } from '../core/feature-frame';
import { FeatureExtractor } from '../core/features';
import { HopCollector } from '../core/hop-collector';

// AudioWorkletGlobalScope members, declared locally so they do not leak into main-thread types.
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  ctor: new (options?: unknown) => AudioWorkletProcessor,
): void;

/** Post a batch about every 16 ms. */
const POST_INTERVAL_S = 0.016;
const MAX_BATCH = 16;

class FeatureProcessor extends AudioWorkletProcessor {
  private readonly extractor = new FeatureExtractor(sampleRate, ANALYSIS.hop);
  private readonly frame = createFrame();
  private readonly mono = new Float32Array(128);
  private batch = new Float64Array(FRAME_STRIDE * MAX_BATCH);
  private batchCount = 0;
  private lastPost = 0;
  private readonly collector = new HopCollector(ANALYSIS.fftSize, ANALYSIS.hop, (win, end) => {
    const centre = (end - ANALYSIS.fftSize / 2) / sampleRate;
    this.extractor.process(win, centre, this.frame);
    if (this.batchCount === MAX_BATCH) this.flush();
    packFrame(this.frame, this.batch, this.batchCount * FRAME_STRIDE);
    this.batchCount++;
  });

  constructor() {
    super();
    // Settings from the main thread.
    this.port.onmessage = (e: MessageEvent<{ type: 'config'; denoise: boolean }>) => {
      if (e.data.type === 'config') this.extractor.denoise = e.data.denoise;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const ch0 = input?.[0];
    if (input && ch0) {
      const len = ch0.length;
      const mono = len === this.mono.length ? this.mono : new Float32Array(len);
      const nch = input.length;
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let c = 0; c < nch; c++) s += input[c]![i]!;
        mono[i] = s / nch;
      }
      this.collector.push(mono, currentFrame);
    }
    const now = currentFrame / sampleRate;
    if (this.batchCount > 0 && now - this.lastPost >= POST_INTERVAL_S) this.flush();
    return true;
  }

  private flush(): void {
    const data = this.batch.slice(0, this.batchCount * FRAME_STRIDE);
    this.port.postMessage({ type: 'frames', data, count: this.batchCount }, [data.buffer]);
    this.batchCount = 0;
    this.lastPost = currentFrame / sampleRate;
  }
}

registerProcessor(PROCESSOR_NAME, FeatureProcessor);
