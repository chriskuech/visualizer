import { ANALYSIS, DENOISE, ONSET } from './config';
import { NoiseGate } from './denoise';
import type { FeatureFrame } from './feature-frame';
import { FFT, hann } from './fft';
import { OnsetDetector } from './onset';

interface BinRange {
  lo: number;
  hi: number; // exclusive
  /** Fractional FFT bin at the centre frequency, used when the range is narrower than a bin. */
  centre: number;
}

function logRanges(count: number, binHz: number, maxBin: number): BinRange[] {
  const ratio = ANALYSIS.fMax / ANALYSIS.fMin;
  const ranges: BinRange[] = [];
  for (let i = 0; i < count; i++) {
    const f0 = ANALYSIS.fMin * ratio ** (i / count);
    const f1 = ANALYSIS.fMin * ratio ** ((i + 1) / count);
    const lo = Math.max(1, Math.ceil(f0 / binHz));
    const hi = Math.min(maxBin, Math.ceil(f1 / binHz));
    ranges.push({ lo, hi, centre: Math.sqrt(f0 * f1) / binHz });
  }
  return ranges;
}

const mapDb = (power: number): number => {
  const db = 10 * Math.log10(power + 1e-20);
  const v = (db - ANALYSIS.dbFloor) / (ANALYSIS.dbCeil - ANALYSIS.dbFloor);
  return Math.min(1, Math.max(0, v));
};

/**
 * Turns one analysis window (fftSize samples, oldest first) into a FeatureFrame.
 * Pure TypeScript with no DOM or Web Audio imports, so it runs unchanged on the main thread
 * (phase 1) and inside the AudioWorklet (phase 2). Allocates nothing per call.
 */
export class FeatureExtractor {
  readonly sampleRate: number;
  readonly hopSeconds: number;
  private readonly n = ANALYSIS.fftSize;
  private readonly fft = new FFT(ANALYSIS.fftSize);
  private readonly window = hann(ANALYSIS.fftSize);
  private readonly re = new Float32Array(ANALYSIS.fftSize);
  private readonly im = new Float32Array(ANALYSIS.fftSize);
  private readonly power = new Float32Array(ANALYSIS.fftSize / 2 + 1);
  private readonly bandLevel = new Float32Array(ANALYSIS.bandCount);
  private readonly specLevel = new Float32Array(ANALYSIS.spectrumBins);
  private readonly prevSpecLevel = new Float32Array(ANALYSIS.spectrumBins);
  private readonly specHz: Float32Array;
  private readonly logMag = new Float32Array(ANALYSIS.fftSize / 2 + 1);
  private readonly prevLogMag = new Float32Array(ANALYSIS.fftSize / 2 + 1);
  private readonly bandRanges: BinRange[];
  private readonly specRanges: BinRange[];
  private readonly bandFollow = new Float32Array(ANALYSIS.bandCount);
  private readonly bandSmooth = new Float32Array(ANALYSIS.bandCount);
  private readonly specSmooth = new Float32Array(ANALYSIS.spectrumBins);
  private specFollow = 0;
  private rmsFollow = 0;
  private peakFollow = 0;
  private rmsSmooth = 0;
  private loudFollow = 0;
  private readonly onset: OnsetDetector;
  private readonly releaseDecay: number;
  private readonly attackCoef: number;
  private readonly releaseCoef: number;
  private readonly powerScale: number;
  private primed = false;

  private readonly autoGain: boolean;
  private readonly bandGate: NoiseGate;
  private readonly specGate: NoiseGate;
  private denoiseOn: boolean;

  constructor(
    sampleRate: number,
    hopSamples: number = ANALYSIS.hop,
    options: { autoGain?: boolean; denoise?: boolean } = {},
  ) {
    this.sampleRate = sampleRate;
    this.autoGain = options.autoGain ?? true;
    this.denoiseOn = options.denoise ?? false;
    this.hopSeconds = hopSamples / sampleRate;
    // Denoise what is drawn: each bar or band averages many bins, so its floor is steady.
    this.bandGate = new NoiseGate(ANALYSIS.bandCount, this.hopSeconds);
    this.specGate = new NoiseGate(ANALYSIS.spectrumBins, this.hopSeconds);
    const binHz = sampleRate / this.n;
    const maxBin = this.n / 2;
    this.bandRanges = logRanges(ANALYSIS.bandCount, binHz, maxBin);
    this.specRanges = logRanges(ANALYSIS.spectrumBins, binHz, maxBin);
    this.specHz = Float32Array.from(this.specRanges, (r) => r.centre * binHz);
    this.onset = new OnsetDetector(this.hopSeconds);
    this.releaseDecay = Math.exp(-this.hopSeconds / ANALYSIS.autoGainReleaseS);
    this.attackCoef = 1 - Math.exp(-this.hopSeconds / ANALYSIS.smoothAttackS);
    this.releaseCoef = 1 - Math.exp(-this.hopSeconds / ANALYSIS.smoothReleaseS);
    let winSum = 0;
    for (let i = 0; i < this.n; i++) winSum += this.window[i]!;
    // A full-scale sine then reads 0 dB (power 1) in its peak bin.
    this.powerScale = (2 / winSum) ** 2;
  }

  /**
   * Removes steady broadband noise from the bands, spectrum bars, loudness, centroid and onsets
   * so the visuals stop jittering on hiss. The raw level (dBFS) still sees the raw signal.
   */
  get denoise(): boolean {
    return this.denoiseOn;
  }

  set denoise(on: boolean) {
    if (on === this.denoiseOn) return;
    this.denoiseOn = on;
    // Flux is measured differently in each mode, so restart the onset threshold's history.
    this.onset.reset();
  }

  /** `samples` must hold exactly fftSize samples, oldest first. `t` is the window centre. */
  process(samples: Float32Array, t: number, out: FeatureFrame): void {
    const n = this.n;
    const re = this.re;
    const im = this.im;
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const s = samples[i]!;
      sumSq += s * s;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
      re[i] = s * this.window[i]!;
      im[i] = 0;
    }
    this.fft.forward(re, im);

    const half = n / 2;
    const power = this.power;
    const logMag = this.logMag;
    const binHz = this.sampleRate / n;
    let flux = 0;
    let wSum = 0;
    let mSum = 0;
    for (let k = 0; k <= half; k++) {
      const p = (re[k]! * re[k]! + im[k]! * im[k]!) * this.powerScale;
      power[k] = p;
      const mag = Math.sqrt(p);
      const lm = Math.log1p(ANALYSIS.logCompression * mag);
      const d = lm - this.prevLogMag[k]!;
      if (d > 0) flux += d;
      logMag[k] = lm;
      wSum += k * binHz * mag;
      mSum += mag;
    }
    flux = this.primed ? flux / half : 0;
    this.prevLogMag.set(logMag);
    this.primed = true;

    // Level.
    const rms = Math.sqrt(sumSq / n);
    out.levelDb = 20 * Math.log10(rms + 1e-12);
    this.rmsFollow = Math.max(rms, this.rmsFollow * this.releaseDecay);
    this.peakFollow = Math.max(peak, this.peakFollow * this.releaseDecay);
    out.peak = Math.min(1, peak / Math.max(this.peakFollow, ANALYSIS.levelGainFloor));

    // dB-mapped level per band and per bar, then (optionally) the noise gate. The gates always
    // keep learning, so switching denoise on works immediately.
    for (let b = 0; b < ANALYSIS.bandCount; b++)
      this.bandLevel[b] = mapDb(this.rangePower(this.bandRanges[b]!));
    for (let i = 0; i < ANALYSIS.spectrumBins; i++)
      this.specLevel[i] = mapDb(this.rangePower(this.specRanges[i]!));
    this.bandGate.process(this.bandLevel, this.denoiseOn);
    this.specGate.process(this.specLevel, this.denoiseOn);
    if (this.denoiseOn) {
      // Onsets from the gated bars: noise reads as 0 there, so it cannot fire false beats.
      let gatedFlux = 0;
      for (let i = 0; i < ANALYSIS.spectrumBins; i++) {
        const d = this.specLevel[i]! - this.prevSpecLevel[i]!;
        if (d > 0) gatedFlux += d;
      }
      // Summed, not averaged: gated noise is exactly 0, so any rise is signal.
      flux = gatedFlux;
    }
    this.prevSpecLevel.set(this.specLevel);

    // Loudness (`rms`, auto-gained). With denoise on it comes from the gated bands, so steady
    // noise that auto-gain would otherwise boost to full scale reads as 0.
    let rmsNorm: number;
    if (this.denoiseOn) {
      // The loudest gated band: 0 for noise alone; a single note is not diluted by quiet bands.
      let loud = 0;
      for (let b = 0; b < ANALYSIS.bandCount; b++) loud = Math.max(loud, this.bandLevel[b]!);
      this.loudFollow = Math.max(loud, this.loudFollow * this.releaseDecay);
      rmsNorm = this.autoGain ? loud / Math.max(this.loudFollow, ANALYSIS.autoGainFloor) : loud;
      // Meter: dB above the noise floor (gated values are in 0..1 over the mapped dB range).
      const dbAboveFloor = loud * (ANALYSIS.dbCeil - ANALYSIS.dbFloor);
      out.level = Math.min(1, dbAboveFloor / DENOISE.meterFullDb);
    } else {
      rmsNorm = rms / Math.max(this.rmsFollow, ANALYSIS.levelGainFloor);
      out.level = Math.min(1, Math.max(0, (out.levelDb + 60) / 60));
    }
    this.rmsSmooth = this.smooth(this.rmsSmooth, rmsNorm);
    out.rms = this.rmsSmooth;

    // Bands with per-band auto-gain, then smoothing.
    for (let b = 0; b < ANALYSIS.bandCount; b++) {
      const v = this.bandLevel[b]!;
      const f = Math.max(v, this.bandFollow[b]! * this.releaseDecay);
      this.bandFollow[b] = f;
      const norm = this.autoGain ? v / Math.max(f, ANALYSIS.autoGainFloor) : v;
      this.bandSmooth[b] = this.smooth(this.bandSmooth[b]!, norm);
      out.bands[b] = this.bandSmooth[b]!;
    }

    // Spectrum with one shared follower.
    let specMax = 0;
    for (let i = 0; i < ANALYSIS.spectrumBins; i++) {
      const v = this.specLevel[i]!;
      out.spectrum[i] = v;
      if (v > specMax) specMax = v;
    }
    this.specFollow = Math.max(specMax, this.specFollow * this.releaseDecay);
    const specGain = this.autoGain ? 1 / Math.max(this.specFollow, ANALYSIS.autoGainFloor) : 1;
    for (let i = 0; i < ANALYSIS.spectrumBins; i++) {
      this.specSmooth[i] = this.smooth(this.specSmooth[i]!, out.spectrum[i]! * specGain);
      out.spectrum[i] = this.specSmooth[i]!;
    }

    if (this.denoiseOn) {
      // Centroid from the gated bars, so hiss does not push the brightness up.
      wSum = 0;
      mSum = 0;
      for (let i = 0; i < ANALYSIS.spectrumBins; i++) {
        const w = this.specLevel[i]!;
        wSum += this.specHz[i]! * w;
        mSum += w;
      }
    }
    out.centroid = mSum > 1e-9 ? wSum / mSum : 0;
    out.flux = flux;
    const o = this.onset.process(flux, t, this.denoiseOn ? ONSET.minGatedFlux : ONSET.minFlux);
    out.onset = o.onset;
    out.onsetStrength = o.strength;
    out.t = t;
  }

  private rangePower(r: BinRange): number {
    const power = this.power;
    if (r.hi > r.lo) {
      let s = 0;
      for (let k = r.lo; k < r.hi; k++) s += power[k]!;
      return s;
    }
    // Narrower than one FFT bin: interpolate between neighbours.
    const k0 = Math.floor(r.centre);
    const frac = r.centre - k0;
    return power[k0]! * (1 - frac) + (power[k0 + 1] ?? 0) * frac;
  }

  private smooth(prev: number, next: number): number {
    const c = next > prev ? this.attackCoef : this.releaseCoef;
    return prev + (next - prev) * c;
  }
}
