/** Caps full-frame brightness pulses at `maxPerSecond` (photosensitivity safety). Pure. */
export class FlashLimiter {
  private last = Number.NEGATIVE_INFINITY;
  private readonly minGap: number;

  constructor(maxPerSecond = 3) {
    this.minGap = 1 / maxPerSecond;
  }

  /** `now` in seconds. Returns true if a pulse may fire now, and records it. */
  allow(now: number): boolean {
    if (now - this.last < this.minGap) return false;
    this.last = now;
    return true;
  }
}

/** Exponentially decaying pulse driven by gated onsets. Allocation-free. */
export class Pulse {
  value = 0;
  constructor(private readonly decayS = 0.18) {}

  update(onset: boolean, strength: number, dt: number): number {
    this.value *= Math.exp(-dt / this.decayS);
    if (onset) this.value = Math.max(this.value, 0.5 + 0.5 * strength);
    return this.value;
  }
}
