/**
 * Popovers anchored to their FABs. At most one is open; Esc or a click elsewhere closes it and
 * returns focus to its FAB. (Hand-rolled because Safari 16.4 lacks the Popover API.)
 */
export class Popovers {
  private readonly pairs = new Map<string, { fab: HTMLButtonElement; pop: HTMLElement }>();
  private openId: string | null = null;

  constructor(private readonly root: HTMLElement) {
    document.addEventListener('pointerdown', (e) => {
      if (this.openId && !this.root.contains(e.target as Node)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openId) {
        const fab = this.pairs.get(this.openId)?.fab;
        this.close();
        fab?.focus();
      }
    });
  }

  register(id: string, fab: HTMLButtonElement, pop: HTMLElement): void {
    this.pairs.set(id, { fab, pop });
    fab.addEventListener('click', () => (this.openId === id ? this.close() : this.open(id, true)));
  }

  /** `focus`: move focus into the popover (user opened it) or leave it (opened by code). */
  open(id: string, focus: boolean): void {
    if (this.openId === id) return;
    this.close();
    const p = this.pairs.get(id);
    if (!p) return;
    this.openId = id;
    p.pop.hidden = false;
    p.fab.setAttribute('aria-expanded', 'true');
    if (focus) p.pop.querySelector<HTMLElement>('input:checked, input, button, select')?.focus();
  }

  close(): void {
    const p = this.openId ? this.pairs.get(this.openId) : undefined;
    this.openId = null;
    if (!p) return;
    p.pop.hidden = true;
    p.fab.setAttribute('aria-expanded', 'false');
  }
}
