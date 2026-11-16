/**
 * Creates and resumes the AudioContext. Call synchronously inside the start-button click
 * handler: autoplay policies (Safari especially) require a user gesture.
 */
export function createAudioContext(): AudioContext {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  void ctx.resume();
  return ctx;
}

/** Converts display-clock times (performance.now, event.timeStamp) to audio-clock seconds. */
export interface Clock {
  fromPerf(perfMs: number): number;
  now(): number;
}

/**
 * Maps the display clock (performance.now / event.timeStamp) onto the audio clock using
 * getOutputTimestamp(). Never Date.now().
 */
export class AudioClock implements Clock {
  private anchorCtx = 0;
  private anchorPerf = 0;

  constructor(private readonly ctx: AudioContext) {}

  /** Audio-clock time (seconds) corresponding to a performance-clock time (ms). */
  fromPerf(perfMs: number): number {
    const ts =
      typeof this.ctx.getOutputTimestamp === 'function' ? this.ctx.getOutputTimestamp() : null;
    if (ts && typeof ts.contextTime === 'number' && ts.performanceTime && ts.performanceTime > 0) {
      return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
    // Fallback: anchor currentTime to performance.now whenever currentTime advances.
    const now = performance.now();
    if (this.ctx.currentTime !== this.anchorCtx) {
      this.anchorCtx = this.ctx.currentTime;
      this.anchorPerf = now;
    }
    return this.anchorCtx + (perfMs - this.anchorPerf) / 1000;
  }

  now(): number {
    return this.fromPerf(performance.now());
  }
}
