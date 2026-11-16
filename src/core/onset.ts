import { ONSET, type OnsetConfig } from './config';

export interface OnsetResult {
  onset: boolean;
  strength: number;
}

/**
 * Adaptive-threshold peak picker over a spectral-flux stream.
 * Threshold = rolling median over `medianWindowS` + `madMultiplier` x rolling mean absolute
 * deviation, with a refractory period. Causal: the window holds past values only.
 */
export class OnsetDetector {
  private readonly history: Float32Array;
  private readonly scratch: Float32Array;
  private count = 0;
  private head = 0;
  private lastOnsetT = Number.NEGATIVE_INFINITY;
  private readonly config: OnsetConfig;
  readonly result: OnsetResult = { onset: false, strength: 0 };

  constructor(hopSeconds: number, config: Partial<OnsetConfig> = {}) {
    this.config = { ...ONSET, ...config };
    const n = Math.max(3, Math.round(this.config.medianWindowS / hopSeconds));
    this.history = new Float32Array(n);
    this.scratch = new Float32Array(n);
  }

  /** Returns a shared result object; copy fields out before the next call. */
  process(flux: number, t: number, minFlux: number = this.config.minFlux): OnsetResult {
    const threshold = Math.max(minFlux, this.threshold());
    const r = this.result;
    r.onset = false;
    r.strength = 0;
    if (flux > threshold && t - this.lastOnsetT >= this.config.refractoryS) {
      r.onset = true;
      r.strength = Math.min(1, (flux - threshold) / (threshold + 1e-9));
      this.lastOnsetT = t;
    }
    this.history[this.head] = flux;
    this.head = (this.head + 1) % this.history.length;
    if (this.count < this.history.length) this.count++;
    return r;
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
    this.lastOnsetT = Number.NEGATIVE_INFINITY;
  }

  private threshold(): number {
    const n = this.count;
    if (n < 3) return Number.POSITIVE_INFINITY;
    const s = this.scratch.subarray(0, n);
    s.set(this.history.subarray(0, n));
    s.sort();
    const median = n % 2 === 1 ? s[n >> 1]! : 0.5 * (s[(n >> 1) - 1]! + s[n >> 1]!);
    let mad = 0;
    for (let i = 0; i < n; i++) mad += Math.abs(s[i]! - median);
    mad /= n;
    return median + this.config.madMultiplier * mad;
  }
}
