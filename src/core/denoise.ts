import { ANALYSIS, DENOISE } from './config';

const DB_RANGE = ANALYSIS.dbCeil - ANALYSIS.dbFloor;

/**
 * Per-channel noise gate on dB-mapped values (0..1, as drawn). Each channel keeps a smoothed
 * value and a floor that follows it down quickly and rises slowly, so the floor settles on the
 * background that is always there (hiss, fans) while music stays above it. Output is the value
 * minus (floor + margin + a multiple of the channel's typical wobble), never below 0. Working in
 * dB keeps the result as steady as the input: subtracting a slow floor adds no flicker.
 *
 * Digital silence (a value of 0, i.e. at or below the dB floor) is ignored while learning, so a
 * microphone's silent first moments or a pause between tracks do not drag the floor to 0. For the
 * first `warmupS` of signal the floor rises fast, so it settles on the room within about a second,
 * and the gate outputs 0 meanwhile, so start-up never flashes the noise it is still learning.
 * Pure and allocation-free after construction.
 */
export class NoiseGate {
  private readonly smoothed: Float32Array;
  private readonly floor: Float32Array;
  private readonly wobble: Float32Array;
  /** Hops of signal heard per channel (saturates once warm). */
  private readonly heard: Uint32Array;
  private readonly riseStep: number;
  private readonly fallStep: number;
  private readonly warmRiseStep: number;
  private readonly warmHops: number;
  private readonly margin: number;
  private readonly alpha: number;

  constructor(channels: number, hopSeconds: number) {
    this.smoothed = new Float32Array(channels);
    this.floor = new Float32Array(channels);
    this.wobble = new Float32Array(channels);
    this.heard = new Uint32Array(channels);
    this.riseStep = (DENOISE.riseDbPerS * hopSeconds) / DB_RANGE;
    this.fallStep = (DENOISE.fallDbPerS * hopSeconds) / DB_RANGE;
    this.warmRiseStep = (DENOISE.warmupRiseDbPerS * hopSeconds) / DB_RANGE;
    this.warmHops = Math.round(DENOISE.warmupS / hopSeconds);
    this.margin = DENOISE.marginDb / DB_RANGE;
    this.alpha = 1 - Math.exp(-hopSeconds / DENOISE.smoothS);
  }

  /**
   * `values` are dB-mapped levels (0..1), one per channel. The floor always updates; values are
   * gated in place only when `apply` is true, so switching on mid-stream works immediately.
   */
  process(values: Float32Array, apply = true): void {
    const { smoothed, floor, wobble, heard } = this;
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (v <= 0) continue; // digital silence: nothing to learn, and it gates to 0 anyway
      const n = heard[i]!;
      if (n === 0) {
        smoothed[i] = v;
        floor[i] = v;
      }
      if (n <= this.warmHops) heard[i] = n + 1;
      const s = smoothed[i]! + (v - smoothed[i]!) * this.alpha;
      smoothed[i] = s;
      const prev = floor[i]!;
      const rise = n < this.warmHops ? this.warmRiseStep : this.riseStep;
      const f = Math.max(prev - this.fallStep, Math.min(s, prev + rise));
      floor[i] = f;
      // Typical wobble, learned only near the floor so music does not widen the margin.
      if (v - f < 4 * (wobble[i]! + this.margin))
        wobble[i]! += (Math.abs(v - s) - wobble[i]!) * this.alpha;
      if (!apply) continue;
      // Still learning the room: output nothing rather than flash noise at start-up.
      values[i] =
        n < this.warmHops
          ? 0
          : Math.max(0, v - f - this.margin - DENOISE.wobbleFactor * wobble[i]!);
    }
  }

  /** Forget everything learned (e.g. after a source switch). */
  reset(): void {
    this.heard.fill(0);
    this.wobble.fill(0);
  }
}
