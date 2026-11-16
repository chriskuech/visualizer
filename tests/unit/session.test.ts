import { describe, expect, it, vi } from 'vitest';
import { TapCalibrator } from '../../src/core/calibrate';
import { createFrame, type FeatureFrame } from '../../src/core/feature-frame';
import { LagBuffer } from '../../src/core/lag-buffer';
import type { Analyzer } from '../../src/services/analyzer';
import { type AudioSource, type EndReason, SourceError } from '../../src/services/audio-source';
import {
  type CaptureDeps,
  CaptureSession,
  type SourceRequest,
} from '../../src/services/capture-session';
import type { WakeLockService, WakeStatus } from '../../src/services/wake-lock';

/** Fakes for every injected dependency: no browser needed. */
function setup(startSource: () => Promise<AudioNode> = async () => ({}) as AudioNode) {
  let emit: (f: FeatureFrame) => void = () => {};
  let ended: (r: EndReason) => void = () => {};
  const analyzer: Analyzer = {
    mode: 'worklet',
    connect: vi.fn(),
    disconnect: vi.fn(),
    poll: vi.fn(),
    setDenoise: vi.fn(),
    onFrame: (cb) => {
      emit = cb;
    },
  };
  const source: AudioSource = {
    id: 'display',
    label: 'Fake',
    kind: 'digital',
    start: startSource,
    stop: vi.fn(),
    onEnded: (cb) => {
      ended = cb;
    },
  };
  const wake: WakeLockService & { status: WakeStatus } = {
    status: 'off',
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    onChange: () => {},
  };
  let now = 0;
  const deps: CaptureDeps = {
    createContext: () => ({ resume: async () => {} }) as unknown as AudioContext,
    createClock: () => ({ fromPerf: (p) => p / 1000, now: () => now }),
    createAnalyzer: async () => analyzer,
    createSource: (_r: SourceRequest) => source,
    wake,
    lagBuffer: new LagBuffer(),
    calibrator: new TapCalibrator(),
    lagMs: () => 100,
  };
  const session = new CaptureSession(deps);
  return {
    session,
    analyzer,
    source,
    wake,
    emit: (f: FeatureFrame) => emit(f),
    end: () => ended('user'),
    setNow: (t: number) => {
      now = t;
    },
  };
}

const frame = (t: number, levelDb = -20, onset = false) =>
  Object.assign(createFrame(), { t, levelDb, onset, rms: t });

describe('CaptureSession', () => {
  it('runs a source and serves frames delayed by the lag', async () => {
    const { session, emit, setNow, wake } = setup();
    await session.start({ id: 'display' });
    expect(session.state.get().phase.kind).toBe('running');
    expect(wake.start).toHaveBeenCalled();
    for (let i = 0; i <= 10; i++) emit(frame(i / 10));
    setNow(1.0);
    const out = createFrame();
    expect(session.read(out)).toBe(true);
    expect(out.rms).toBeCloseTo(0.9, 5); // now - 100 ms
  });

  it('reports a source error and releases the wake lock', async () => {
    const { session, wake } = setup(async () => {
      throw new SourceError('no-audio', 'none');
    });
    await session.start({ id: 'display' });
    expect(session.state.get().phase).toMatchObject({
      kind: 'error',
      error: 'no-audio',
      source: 'display',
    });
    expect(wake.stop).toHaveBeenCalled();
  });

  it('moves to an ended error when the user stops sharing', async () => {
    const { session, end, source } = setup();
    await session.start({ id: 'display' });
    end();
    expect(session.state.get().phase).toMatchObject({ kind: 'error', error: 'ended' });
    expect(source.stop).toHaveBeenCalled();
  });

  it('flags silence after 5 s below -80 dBFS and clears it when sound returns', async () => {
    const { session, emit } = setup();
    await session.start({ id: 'display' });
    for (let t = 0; t <= 5.1; t += 0.1) emit(frame(t, -100));
    expect(session.state.get().silent).toBe(true);
    emit(frame(5.2, -30));
    expect(session.state.get().silent).toBe(false);
  });

  it('applies denoise to the analyzer, including a setting chosen before it existed', async () => {
    const { session, analyzer } = setup();
    session.setDenoise(false);
    await session.start({ id: 'display' });
    expect(analyzer.setDenoise).toHaveBeenLastCalledWith(false);
    session.setDenoise(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(analyzer.setDenoise).toHaveBeenLastCalledWith(true);
  });

  it('returns to idle on stop', async () => {
    const { session } = setup();
    await session.start({ id: 'display' });
    session.stop();
    expect(session.state.get().phase.kind).toBe('idle');
    expect(session.read(createFrame())).toBe(false);
  });
});
