import { describe, expect, it, vi } from 'vitest';
import { keepAwakeInFullscreen } from '../../src/app/keep-awake';
import type { AppState } from '../../src/app/state';
import { Store } from '../../src/core/store';
import type { WakeLockService } from '../../src/services/wake-lock';

function setup(fullscreen = false) {
  const store = new Store({ fullscreen } as AppState);
  const wake: WakeLockService = {
    status: 'off',
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    onChange: () => {},
  };
  keepAwakeInFullscreen(store, wake);
  return { store, wake };
}

describe('keepAwakeInFullscreen', () => {
  it('does not keep the screen awake while windowed', () => {
    const { wake } = setup();
    expect(wake.start).not.toHaveBeenCalled();
  });

  it('keeps the screen awake exactly while fullscreen', () => {
    const { store, wake } = setup();
    store.set({ fullscreen: true });
    expect(wake.start).toHaveBeenCalledTimes(1);
    store.set({ fullscreen: false });
    expect(wake.stop).toHaveBeenCalledTimes(2); // once at boot, once on exit
    store.set({ fullscreen: true });
    expect(wake.start).toHaveBeenCalledTimes(2);
  });
});
