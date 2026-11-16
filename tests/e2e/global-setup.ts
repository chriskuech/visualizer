import { mkdirSync, writeFileSync } from 'node:fs';

/** Writes a 120 BPM click track over a quiet tone as a 16-bit mono WAV for fake capture. */
export default function globalSetup(): void {
  const sr = 48000;
  const seconds = 10;
  const n = sr * seconds;
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sr, 24);
  data.writeUInt32LE(sr * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);
  let seed = 1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const sinceBeat = t % 0.5;
    const click = sinceBeat < 0.03 ? (rand() * 2 - 1) * 0.8 * Math.exp(-sinceBeat / 0.006) : 0;
    const tone = 0.1 * Math.sin(2 * Math.PI * 220 * t);
    const s = Math.max(-1, Math.min(1, click + tone));
    data.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  mkdirSync('tests/e2e/fixtures', { recursive: true });
  writeFileSync('tests/e2e/fixtures/clicks.wav', data);
}
