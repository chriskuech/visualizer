/** Fullscreen for the app container (so the panel and HUD stay available). */
export class Fullscreen {
  constructor(private readonly container: HTMLElement) {}

  static get supported(): boolean {
    return document.fullscreenEnabled === true;
  }

  get active(): boolean {
    return document.fullscreenElement === this.container;
  }

  /** Fires on every change, including the user pressing Esc. */
  onChange(cb: (active: boolean) => void): void {
    document.addEventListener('fullscreenchange', () => cb(this.active));
  }

  /** Must run from a user gesture. Never assumes the toggle succeeded: fullscreenchange decides. */
  toggle(): void {
    if (!Fullscreen.supported) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void this.container.requestFullscreen().catch(() => {});
  }
}
