import { ANALYSIS } from './config';

/** One analysis hop's worth of features. Produced by the analyzer, delayed by the lag buffer. */
export interface FeatureFrame {
  /** AudioContext time in seconds at the window centre. */
  t: number;
  rms: number; // 0..1 linear, after auto-gain
  peak: number; // 0..1
  /** Raw RMS in dBFS before auto-gain and denoise. Drives silence detection. */
  levelDb: number;
  /**
   * 0..1 level for meters. Without denoise: raw RMS mapped from -60..0 dBFS. With denoise: how
   * far the loudest band is above the learned noise floor, so steady noise reads as 0.
   */
  level: number;
  bands: Float32Array; // 8 log-spaced band energies, 0..1, smoothed
  spectrum: Float32Array; // 64 log-spaced bins, 0..1, for bar and ring visuals
  centroid: number; // Hz, spectral brightness
  flux: number; // half-wave rectified spectral flux
  onset: boolean;
  onsetStrength: number; // 0..1
}

export function createFrame(): FeatureFrame {
  return {
    t: 0,
    rms: 0,
    peak: 0,
    levelDb: -120,
    level: 0,
    bands: new Float32Array(ANALYSIS.bandCount),
    spectrum: new Float32Array(ANALYSIS.spectrumBins),
    centroid: 0,
    flux: 0,
    onset: false,
    onsetStrength: 0,
  };
}

export function copyFrame(src: FeatureFrame, dst: FeatureFrame): void {
  dst.t = src.t;
  dst.rms = src.rms;
  dst.peak = src.peak;
  dst.levelDb = src.levelDb;
  dst.level = src.level;
  dst.bands.set(src.bands);
  dst.spectrum.set(src.spectrum);
  dst.centroid = src.centroid;
  dst.flux = src.flux;
  dst.onset = src.onset;
  dst.onsetStrength = src.onsetStrength;
}

/** Packed layout for posting batches of frames from the worklet in one transferable buffer. */
const SCALARS = 9;
export const FRAME_STRIDE = SCALARS + ANALYSIS.bandCount + ANALYSIS.spectrumBins;

export function packFrame(f: FeatureFrame, out: Float64Array, offset: number): void {
  out[offset] = f.t;
  out[offset + 1] = f.rms;
  out[offset + 2] = f.peak;
  out[offset + 3] = f.levelDb;
  out[offset + 4] = f.centroid;
  out[offset + 5] = f.flux;
  out[offset + 6] = f.onset ? 1 : 0;
  out[offset + 7] = f.onsetStrength;
  out[offset + 8] = f.level;
  let o = offset + SCALARS;
  for (let i = 0; i < f.bands.length; i++) out[o++] = f.bands[i]!;
  for (let i = 0; i < f.spectrum.length; i++) out[o++] = f.spectrum[i]!;
}

export function unpackFrame(src: Float64Array, offset: number, f: FeatureFrame): void {
  f.t = src[offset]!;
  f.rms = src[offset + 1]!;
  f.peak = src[offset + 2]!;
  f.levelDb = src[offset + 3]!;
  f.centroid = src[offset + 4]!;
  f.flux = src[offset + 5]!;
  f.onset = src[offset + 6]! > 0.5;
  f.onsetStrength = src[offset + 7]!;
  f.level = src[offset + 8]!;
  let o = offset + SCALARS;
  for (let i = 0; i < f.bands.length; i++) f.bands[i] = src[o++]!;
  for (let i = 0; i < f.spectrum.length; i++) f.spectrum[i] = src[o++]!;
}
