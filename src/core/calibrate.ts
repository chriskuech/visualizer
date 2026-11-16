import { type Ms, ms } from './units';

export const CALIBRATION = {
  /** Offsets (tap - onset) considered, in ms. Wide because the lag is unknown. */
  windowMinMs: -100,
  windowMaxMs: 800,
  binMs: 10,
  /** Half-width of the band around the peak used for the median and confidence. */
  bandMs: 30,
  minTaps: 8,
  minConfidence: 0.6,
  /** Systematic early (+) or late (-) tapping correction, subtracted from the result. */
  TAP_BIAS_MS: 0,
  /**
   * Half-width used to refine the estimate. Wider than `bandMs` so heavily jittered taps still
   * count, which halves the error at 40 ms jitter compared with a 30 ms median.
   */
  refineMs: 70,
  /** Peaks within this share of the tallest are treated as ties; the smallest lag wins. */
  tieRatio: 0.8,
  maxLagMs: 1000,
  /** Onset history kept for matching, in seconds. */
  historyS: 12,
  /** Silence after which a new tap starts a new session, in seconds. */
  sessionGapS: 3,
} as const;

export type CalibrationConfig = { -readonly [K in keyof typeof CALIBRATION]: number };

export interface CalibrationResult {
  taps: number;
  /** Best estimate, before the confidence gate. Clamped to 0..maxLagMs. */
  lagMs: Ms;
  confidence: number;
  /** True when there are enough taps and confidence passes: safe to apply. */
  ok: boolean;
  /** True when the measured lag was negative and was clamped to 0. */
  clamped: boolean;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : 0.5 * (s[m - 1]! + s[m]!);
};

const trimmedMean = (xs: number[], share: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length * share);
  const kept = s.slice(k, s.length - k);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
};

/**
 * Estimates the audio-to-ear lag from tap times and raw onset times (both in seconds on the
 * audio clock). Builds a histogram of every tap-to-onset offset in the window: a consistent lag
 * piles offsets into one bin, while wrong-beat matches scatter.
 */
export function calibrate(
  taps: readonly number[],
  onsets: readonly number[],
  config: Partial<CalibrationConfig> = {},
): CalibrationResult {
  const c: CalibrationConfig = { ...CALIBRATION, ...config };
  const empty: CalibrationResult = {
    taps: taps.length,
    lagMs: ms(0),
    confidence: 0,
    ok: false,
    clamped: false,
  };
  if (taps.length === 0 || onsets.length === 0) return empty;

  const sorted = [...onsets].sort((a, b) => a - b);
  const perTap: number[][] = taps.map((tap) => {
    const offs: number[] = [];
    for (const o of sorted) {
      const d = (tap - o) * 1000;
      if (d >= c.windowMinMs && d <= c.windowMaxMs) offs.push(d);
    }
    return offs;
  });

  const bins = Math.ceil((c.windowMaxMs - c.windowMinMs) / c.binMs) + 1;
  const hist = new Float64Array(bins);
  for (const offs of perTap)
    for (const d of offs) hist[Math.floor((d - c.windowMinMs) / c.binMs)]! += 1;

  // Triangular smoothing over the refine width so jittered taps that straddle bins still form
  // one peak.
  const radius = Math.round(c.refineMs / c.binMs);
  const smooth = new Float64Array(bins);
  let max = 0;
  for (let i = 0; i < bins; i++) {
    let s = 0;
    for (let j = i - radius; j <= i + radius; j++)
      s += (hist[j] ?? 0) * (1 - Math.abs(j - i) / (radius + 1));
    smooth[i] = s;
    if (s > max) max = s;
  }
  if (max === 0) return empty;

  // Smallest-lag peak among near-ties: with a steady beat, lag + one period also piles up.
  let peak = 0;
  for (let i = 0; i < bins; i++) {
    const v = smooth[i]!;
    if (v >= c.tieRatio * max && v >= (smooth[i - 1] ?? 0) && v >= (smooth[i + 1] ?? 0)) {
      // Extend through a plateau to its centre.
      let j = i;
      while (j + 1 < bins && smooth[j + 1] === v) j++;
      peak = Math.round((i + j) / 2);
      break;
    }
  }
  let centre = c.windowMinMs + (peak + 0.5) * c.binMs;

  // Refine: each tap contributes its offset nearest the centre. Start with the median within
  // the band, then a trimmed mean within the wider refine band (more efficient on jitter).
  const nearest = (width: number): number[] => {
    const picked: number[] = [];
    for (const offs of perTap) {
      let best = Number.NaN;
      let bestDist = width;
      for (const d of offs) {
        const dist = Math.abs(d - centre);
        if (dist <= bestDist) {
          best = d;
          bestDist = dist;
        }
      }
      if (!Number.isNaN(best)) picked.push(best);
    }
    return picked;
  };
  const firstPass = nearest(c.bandMs);
  if (firstPass.length > 0) centre = median(firstPass);
  for (let iter = 0; iter < 4; iter++) {
    const picked = nearest(c.refineMs);
    if (picked.length === 0) break;
    const next = trimmedMean(picked, 0.1);
    const done = Math.abs(next - centre) < 0.5;
    centre = next;
    if (done) break;
  }
  const inBand = nearest(c.bandMs);

  const confidence = inBand.length / taps.length;
  const raw = centre - c.TAP_BIAS_MS;
  const clamped = raw < 0;
  const lag = Math.min(c.maxLagMs, Math.max(0, raw));
  return {
    taps: taps.length,
    lagMs: ms(Math.round(lag)),
    confidence,
    ok: taps.length >= c.minTaps && confidence >= c.minConfidence,
    clamped,
  };
}

/** Holds recent raw onsets and the current tap session. Pure; times in audio-clock seconds. */
export class TapCalibrator {
  private onsets: number[] = [];
  private taps: number[] = [];

  constructor(private readonly config: Partial<CalibrationConfig> = {}) {}

  private get c(): CalibrationConfig {
    return { ...CALIBRATION, ...this.config };
  }

  addOnset(t: number): void {
    this.onsets.push(t);
    const cutoff = t - this.c.historyS;
    let drop = 0;
    while (drop < this.onsets.length && this.onsets[drop]! < cutoff) drop++;
    if (drop > 0) this.onsets.splice(0, drop);
  }

  get tapCount(): number {
    return this.taps.length;
  }

  /** True when the next tap would start a new session. */
  isStale(now: number): boolean {
    const last = this.taps.at(-1);
    return last === undefined || now - last > this.c.sessionGapS;
  }

  tap(t: number): CalibrationResult {
    if (this.isStale(t)) this.taps = [];
    this.taps.push(t);
    const cutoff = t - this.c.historyS;
    this.taps = this.taps.filter((x) => x >= cutoff);
    return calibrate(this.taps, this.onsets, this.config);
  }

  /** Ends the current tap session but keeps the onset history. */
  clearTaps(): void {
    this.taps = [];
  }

  reset(): void {
    this.taps = [];
    this.onsets = [];
  }
}
