import type { Store } from '../core/store';
import type { WakeLockService } from '../services/wake-lock';
import type { AppState } from './state';

/**
 * The screen is kept awake exactly while the app is fullscreen: entering fullscreen takes the
 * wake lock and leaving it (button, F or Esc) releases it, whatever the source or the sound.
 * Entering fullscreen is a user gesture, so the video fallback is allowed to play.
 */
export function keepAwakeInFullscreen(store: Store<AppState>, wake: WakeLockService): void {
  store.select(
    (s) => s.fullscreen,
    (fullscreen) => {
      if (fullscreen) void wake.start();
      else wake.stop();
    },
  );
}
