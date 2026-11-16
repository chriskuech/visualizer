import { copyFrame, createFrame, type FeatureFrame } from './feature-frame';

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/**
 * Ring buffer of the last ~2 s of FeatureFrames keyed by audio time. The renderer reads the
 * frame at `now - lag`, interpolating continuous values. Onsets are events and fire exactly
 * once, on the read where the target time first crosses their timestamp.
 */
export class LagBuffer {
  private readonly frames: FeatureFrame[];
  private start = 0;
  private size = 0;
  private lastTarget = Number.NEGATIVE_INFINITY;
  /** Number of onsets crossed by the latest read (several can collapse into one pulse). */
  crossedOnsets = 0;

  constructor(readonly capacity = 256) {
    this.frames = Array.from({ length: capacity }, createFrame);
  }

  get length(): number {
    return this.size;
  }

  clear(): void {
    this.start = 0;
    this.size = 0;
    this.lastTarget = Number.NEGATIVE_INFINITY;
  }

  /** Frames must arrive in increasing `t`. The data is copied. */
  push(f: FeatureFrame): void {
    let slot: FeatureFrame;
    if (this.size < this.capacity) {
      slot = this.frames[(this.start + this.size) % this.capacity]!;
      this.size++;
    } else {
      slot = this.frames[this.start]!;
      this.start = (this.start + 1) % this.capacity;
    }
    copyFrame(f, slot);
  }

  private at(i: number): FeatureFrame {
    return this.frames[(this.start + i) % this.capacity]!;
  }

  /**
   * Writes the state at audio time `target` into `out`. Returns false when the buffer is empty.
   * `out.onset` is true when one or more onsets were crossed since the previous read.
   */
  read(target: number, out: FeatureFrame): boolean {
    const n = this.size;
    if (n === 0) return false;
    // Largest index with t <= target (binary search; t is monotonic).
    let lo = 0;
    let hi = n - 1;
    if (target <= this.at(0).t) hi = 0;
    else if (target >= this.at(n - 1).t) lo = n - 1;
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (this.at(mid).t <= target) lo = mid;
        else hi = mid;
      }
    }
    const a = this.at(lo);
    const b = this.at(Math.min(lo + 1, n - 1));
    const span = b.t - a.t;
    const u = span > 0 ? Math.min(1, Math.max(0, (target - a.t) / span)) : 0;
    out.t = target;
    out.rms = lerp(a.rms, b.rms, u);
    out.peak = lerp(a.peak, b.peak, u);
    out.levelDb = lerp(a.levelDb, b.levelDb, u);
    out.level = lerp(a.level, b.level, u);
    out.centroid = lerp(a.centroid, b.centroid, u);
    out.flux = lerp(a.flux, b.flux, u);
    for (let i = 0; i < out.bands.length; i++) out.bands[i] = lerp(a.bands[i]!, b.bands[i]!, u);
    for (let i = 0; i < out.spectrum.length; i++)
      out.spectrum[i] = lerp(a.spectrum[i]!, b.spectrum[i]!, u);

    // Fire each onset once: those with lastTarget < t <= target.
    out.onset = false;
    out.onsetStrength = 0;
    this.crossedOnsets = 0;
    if (target > this.lastTarget) {
      for (let i = lo; i >= 0; i--) {
        const f = this.at(i);
        if (f.t <= this.lastTarget) break;
        if (f.t <= target && f.onset) {
          out.onset = true;
          this.crossedOnsets++;
          if (f.onsetStrength > out.onsetStrength) out.onsetStrength = f.onsetStrength;
        }
      }
      this.lastTarget = target;
    }
    return true;
  }
}
