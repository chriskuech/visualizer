export type WakeStatus = 'off' | 'locked' | 'fallback' | 'unavailable';

export interface WakeLockService {
  readonly status: WakeStatus;
  /** Call from the start-button handler. Never throws. */
  start(): Promise<void>;
  stop(): void;
  onChange(cb: (s: WakeStatus) => void): void;
}

/**
 * Screen Wake Lock with a video-loop fallback. The lock is held only while a source runs. The
 * browser releases it when the tab is hidden, so it is re-requested on visibilitychange.
 */
export class ScreenWakeLock implements WakeLockService {
  private sentinel: WakeLockSentinel | null = null;
  private video: HTMLVideoElement | null = null;
  private active = false;
  private current: WakeStatus = 'off';
  private listener: (s: WakeStatus) => void = () => {};

  constructor(private readonly fallbackBase: string) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.active && !this.sentinel)
        void this.acquire();
    });
    window.addEventListener('pagehide', () => this.stop());
  }

  get status(): WakeStatus {
    return this.current;
  }

  onChange(cb: (s: WakeStatus) => void): void {
    this.listener = cb;
  }

  async start(): Promise<void> {
    this.active = true;
    await this.acquire();
  }

  stop(): void {
    this.active = false;
    const s = this.sentinel;
    this.sentinel = null;
    void s?.release().catch(() => {});
    this.stopFallback();
    this.set('off');
  }

  private set(s: WakeStatus): void {
    if (s === this.current) return;
    this.current = s;
    this.listener(s);
  }

  private async acquire(): Promise<void> {
    if ('wakeLock' in navigator && window.isSecureContext) {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (!this.active) {
          void sentinel.release();
          return;
        }
        this.sentinel = sentinel;
        sentinel.addEventListener('release', () => {
          if (this.sentinel === sentinel) this.sentinel = null;
          if (this.active) this.set('unavailable'); // "Screen may dim" until re-acquired
        });
        this.stopFallback();
        this.set('locked');
        return;
      } catch {
        // Refused, e.g. on low battery or when the document is hidden. Fall through.
      }
    }
    if (document.visibilityState === 'visible') await this.startFallback();
  }

  /**
   * WORKAROUND (NoSleep.js style): a muted, looping, inline video keeps some browsers from
   * dimming the screen. Used only after the Wake Lock API is missing or refused.
   */
  private async startFallback(): Promise<void> {
    if (!this.video) {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.style.cssText =
        'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0';
      for (const [ext, type] of [
        ['webm', 'video/webm'],
        ['mp4', 'video/mp4'],
      ] as const) {
        const s = document.createElement('source');
        s.src = `${this.fallbackBase}keepawake.${ext}`;
        s.type = type;
        v.append(s);
      }
      document.body.append(v);
      this.video = v;
    }
    try {
      await this.video.play();
      this.set(this.active ? 'fallback' : 'off');
    } catch {
      this.set('unavailable');
    }
  }

  private stopFallback(): void {
    this.video?.pause();
  }
}
