/**
 * Collects arbitrary-sized blocks (e.g. 128-sample render quanta) into overlapping analysis
 * windows. Calls `onHop` with a chronological fftSize window every `hop` samples, plus the
 * absolute sample index of the window's last sample + 1.
 */
export class HopCollector {
  private readonly ring: Float32Array;
  private readonly windowBuf: Float32Array;
  private write = 0;
  private filled = 0;
  private sinceHop = 0;

  constructor(
    private readonly size: number,
    private readonly hop: number,
    private readonly onHop: (window: Float32Array, endSample: number) => void,
  ) {
    this.ring = new Float32Array(size);
    this.windowBuf = new Float32Array(size);
  }

  /** `startSample` is the absolute index of block[0]. */
  push(block: Float32Array, startSample: number): void {
    for (let i = 0; i < block.length; i++) {
      this.ring[this.write] = block[i]!;
      this.write = (this.write + 1) % this.size;
      if (this.filled < this.size) this.filled++;
      this.sinceHop++;
      if (this.sinceHop >= this.hop && this.filled === this.size) {
        this.sinceHop = 0;
        const tail = this.size - this.write;
        this.windowBuf.set(this.ring.subarray(this.write), 0);
        this.windowBuf.set(this.ring.subarray(0, this.write), tail);
        this.onHop(this.windowBuf, startSample + i + 1);
      }
    }
  }
}
