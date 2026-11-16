import type { Store } from '../core/store';
import type { CaptureSession } from '../services/capture-session';
import type { WakeLockService } from '../services/wake-lock';
import type { AppState } from './state';

/** Visuals that may put the screen to sleep when the music stops. */
const SLEEP_VISUALS = new Set(['ember']);
export const SLEEP = {
  /** Quiet this long before fading out. */
  afterS: 10 * 60,
  /** Fade to and from black over this long. */
  fadeS: 30,
  /** How often to check. */
  checkS: 1,
} as const;

export interface SleepDeps {
  store: Store<AppState>;
  session: CaptureSession;
  wake: WakeLockService;
  /** The canvas: faded with CSS opacity over the black page background. */
  stage: HTMLElement;
}

/**
 * Sleep mode for the sleep visuals: after `afterS` of quiet the visual fades to black and the
 * screen is no longer kept awake, so the display can sleep (and an OLED is spared). When sound
 * returns, or the visual or source changes, it fades back in and keeps the screen awake again.
 */
export class SleepController {
  private asleep = false;

  constructor(private readonly deps: SleepDeps) {
    deps.stage.style.transition = `opacity ${SLEEP.fadeS}s ease-in-out`;
    // Waking up must not wait for the next check when the user acts.
    deps.store.select(
      (s) => s.visualizer,
      () => this.check(),
    );
    deps.session.state.select(
      (s) => s.phase.kind,
      () => this.check(),
    );
  }

  get isAsleep(): boolean {
    return this.asleep;
  }

  start(): void {
    window.setInterval(() => this.check(), SLEEP.checkS * 1000);
  }

  /** Decides whether to be asleep now. Public for tests. */
  check(): void {
    const { store, session } = this.deps;
    const running = session.state.get().phase.kind === 'running';
    const shouldSleep =
      running && SLEEP_VISUALS.has(store.get().visualizer) && session.quietFor >= SLEEP.afterS;
    if (shouldSleep === this.asleep) return;
    this.asleep = shouldSleep;
    this.deps.stage.style.opacity = shouldSleep ? '0' : '1';
    if (shouldSleep) this.deps.wake.stop();
    else if (running) void this.deps.wake.start();
  }
}
