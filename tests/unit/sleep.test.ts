import { describe, expect, it, vi } from 'vitest';
import { SLEEP, SleepController } from '../../src/app/sleep';
import type { AppState } from '../../src/app/state';
import { QuietTracker } from '../../src/core/quiet';
import { Store } from '../../src/core/store';
import type { CaptureSession, SessionState } from '../../src/services/capture-session';
import type { WakeLockService } from '../../src/services/wake-lock';

describe('QuietTracker', () => {
  it('counts seconds since the last frame with sound', () => {
    const q = new QuietTracker();
    expect(q.quietFor).toBe(0);
    q.update(0.5, 10); // sound
    q.update(0.0, 15);
    expect(q.quietFor).toBe(5);
    q.update(0.3, 16); // sound again
    expect(q.quietFor).toBe(0);
    q.update(0.01, 20); // below the quiet threshold
    expect(q.quietFor).toBe(4);
  });
});

function setup(visualizer = 'ember') {
  const store = new Store({ visualizer } as AppState);
  const state = new Store<SessionState>({
    phase: { kind: 'running', source: {} as never },
    silent: false,
  });
  let quietFor = 0;
  const session = {
    state,
    get quietFor() {
      return quietFor;
    },
  } as unknown as CaptureSession;
  const wake: WakeLockService = {
    status: 'off',
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    onChange: () => {},
  };
  const stage = { style: {} as Record<string, string> } as unknown as HTMLElement;
  const sleep = new SleepController({ store, session, wake, stage });
  return { store, state, wake, stage, sleep, setQuiet: (s: number) => (quietFor = s) };
}

describe('SleepController', () => {
  it('fades out and lets the screen sleep after 10 quiet minutes on Ember', () => {
    const { sleep, wake, stage, setQuiet } = setup();
    setQuiet(SLEEP.afterS - 1);
    sleep.check();
    expect(sleep.isAsleep).toBe(false);
    setQuiet(SLEEP.afterS);
    sleep.check();
    expect(sleep.isAsleep).toBe(true);
    expect(stage.style.opacity).toBe('0');
    expect(wake.stop).toHaveBeenCalled();
  });

  it('wakes up when sound returns', () => {
    const { sleep, wake, stage, setQuiet } = setup();
    setQuiet(SLEEP.afterS + 60);
    sleep.check();
    setQuiet(0);
    sleep.check();
    expect(sleep.isAsleep).toBe(false);
    expect(stage.style.opacity).toBe('1');
    expect(wake.start).toHaveBeenCalled();
  });

  it('wakes up at once when the visual changes', () => {
    const { sleep, store, setQuiet } = setup();
    setQuiet(SLEEP.afterS + 60);
    sleep.check();
    expect(sleep.isAsleep).toBe(true);
    store.set({ visualizer: 'bars' });
    expect(sleep.isAsleep).toBe(false);
  });

  it('never sleeps on the other visuals', () => {
    const { sleep, setQuiet } = setup('plasma');
    setQuiet(SLEEP.afterS * 10);
    sleep.check();
    expect(sleep.isAsleep).toBe(false);
  });
});
