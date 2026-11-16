/** All analysis constants in one place. */
export const ANALYSIS = {
  fftSize: 2048,
  hop: 512,
  bandCount: 8,
  spectrumBins: 64,
  fMin: 20,
  fMax: 16000,
  /** dB range mapped onto 0..1. */
  dbFloor: -90,
  dbCeil: -20,
  /** Auto-gain peak follower: instant attack, this release time. */
  autoGainReleaseS: 10,
  /** Followers never fall below this, so silence stays dark instead of being amplified. */
  autoGainFloor: 0.25,
  levelGainFloor: 0.01,
  smoothAttackS: 0.01,
  smoothReleaseS: 0.15,
  /** Compression for the log-magnitude spectrum used by onset detection. */
  logCompression: 100,
} as const;

export const ONSET = {
  medianWindowS: 0.5,
  madMultiplier: 1.5,
  refractoryS: 0.1,
  /** Absolute floor on flux so noise in near-silence does not trigger onsets. */
  minFlux: 0.02,
  /**
   * With denoise on, flux is the summed rise of the gated bars. Leftover noise peaks near 0.17
   * and clicks reach 1 or more, so 0.5 separates them.
   */
  minGatedFlux: 0.5,
} as const;

export type OnsetConfig = { -readonly [K in keyof typeof ONSET]: number };

/** Names of the 8 bands, low to high. */
export const BAND_NAMES = [
  'sub-bass',
  'bass',
  'low-mid',
  'mid',
  'upper-mid',
  'presence',
  'brilliance',
  'air',
] as const;

export const PROCESSOR_NAME = 'feature-processor';

/**
 * Noise gate for the drawn values: removes steady broadband noise (hiss, fans) that makes the
 * visuals jitter. Works on the 0..1 dB-mapped bars and bands, per channel.
 */
export const DENOISE = {
  /** Values are smoothed over this time before the floor is estimated. */
  smoothS: 0.08,
  /**
   * The floor follows the smoothed value down quickly and rises at most this fast, so it
   * settles on the steady background but lags behind music. Slower protects held notes longer.
   */
  riseDbPerS: 2,
  /**
   * And falls at most this fast, so brief dips (the edges of a pause, where the analysis window
   * is only part noise) do not drag it down, while a quieter room is still tracked quickly.
   */
  fallDbPerS: 12,
  /**
   * For this long after a channel first hears signal, the floor rises this much faster, so it
   * settles on the room in about a second instead of crawling up from a quiet start.
   */
  warmupS: 1.5,
  warmupRiseDbPerS: 30,
  /** Minimum extra dB removed above the floor. */
  marginDb: 3,
  /**
   * Plus this many times the channel's typical wobble (mean absolute deviation), so narrow bars,
   * whose noise swings more, get a wider margin than broad ones.
   */
  wobbleFactor: 3,
  /** Meter level with denoise on: this many dB above the noise floor fills the meter. */
  meterFullDb: 24,
} as const;
