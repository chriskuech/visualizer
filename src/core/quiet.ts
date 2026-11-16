/** Meter levels below this count as quiet (0..1 scale of FeatureFrame.level). */
export const QUIET_LEVEL = 0.05;

/**
 * Measures how long it has been quiet, on the audio clock. "Quiet" uses the meter level, which
 * is denoised when denoise is on, so a fan or room noise counts as quiet. Pure.
 */
export class QuietTracker {
  private lastSound = Number.NaN;
  private latest = Number.NaN;

  update(level: number, t: number): void {
    if (Number.isNaN(this.lastSound) || level >= QUIET_LEVEL) this.lastSound = t;
    this.latest = t;
  }

  /** Seconds since the last frame with sound (0 before any frame). */
  get quietFor(): number {
    return Number.isNaN(this.latest) ? 0 : this.latest - this.lastSound;
  }

  reset(): void {
    this.lastSound = Number.NaN;
    this.latest = Number.NaN;
  }
}
