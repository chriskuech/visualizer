const IDLE_MS = 3000;

/**
 * Floating control card. Shows on pointer movement (checked once per animation frame), any key,
 * or focus entering it. Hides when the pointer leaves the window or after 3 s idle, except while
 * the pointer is over it, a control has keyboard focus, or the slider is being dragged.
 */
export class FloatingPanel {
  private visible = false;
  private enabled = false;
  private hovered = false;
  private dragging = false;
  private timer: number | undefined;
  private moveQueued = false;
  private readonly listeners = new Set<(visible: boolean) => void>();

  constructor(private readonly panel: HTMLElement) {
    document.addEventListener('mousemove', () => {
      if (this.moveQueued) return;
      this.moveQueued = true;
      requestAnimationFrame(() => {
        this.moveQueued = false;
        this.show();
      });
    });
    document.addEventListener('keydown', () => this.show(), { capture: true });
    document.documentElement.addEventListener('mouseleave', () => this.hide());
    panel.addEventListener('pointerenter', () => {
      this.hovered = true;
      this.show();
    });
    panel.addEventListener('pointerleave', () => {
      this.hovered = false;
      this.restartTimer();
    });
    panel.addEventListener('focusin', () => this.show());
    panel.addEventListener('focusout', () => this.restartTimer());
    for (const range of panel.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      range.addEventListener('pointerdown', () => {
        this.dragging = true;
      });
    }
    document.addEventListener('pointerup', () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.restartTimer();
    });
    this.apply();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  onChange(fn: (visible: boolean) => void): void {
    this.listeners.add(fn);
  }

  /** The panel is only available while running. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) this.show();
    else this.hide(true);
  }

  show(): void {
    if (!this.enabled) return;
    if (!this.visible) {
      this.visible = true;
      this.apply();
    }
    this.restartTimer();
  }

  hide(force = false): void {
    if (!force && this.pinned()) {
      this.restartTimer();
      return;
    }
    window.clearTimeout(this.timer);
    if (!this.visible) return;
    this.visible = false;
    this.apply();
  }

  private pinned(): boolean {
    if (this.hovered || this.dragging) return true;
    const active = document.activeElement;
    return !!active && this.panel.contains(active) && active.matches(':focus-visible');
  }

  private restartTimer(): void {
    window.clearTimeout(this.timer);
    if (this.visible) this.timer = window.setTimeout(() => this.hide(), IDLE_MS);
  }

  private apply(): void {
    const p = this.panel;
    p.classList.toggle('visible', this.visible);
    if (this.visible) {
      p.removeAttribute('inert');
      p.removeAttribute('aria-hidden');
    } else {
      if (document.activeElement instanceof HTMLElement && p.contains(document.activeElement))
        document.activeElement.blur();
      p.setAttribute('inert', '');
      p.setAttribute('aria-hidden', 'true');
    }
    for (const l of this.listeners) l(this.visible);
  }
}
