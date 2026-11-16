import type { SourceId } from '../services/audio-source';
import { SOURCE_TITLES, setupHint } from './copy';
import { type IconName, setIcon } from './icons';

const ICON: Record<SourceId, IconName> = {
  display: 'display',
  microphone: 'microphone',
  file: 'file',
};

/** `[icon] title / description`, shared by the trigger and the options. */
function row(id: SourceId): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = `<span class="opt-icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"></svg></span>
    <span class="opt-text"><span class="opt-title"></span><span class="opt-desc"></span></span>`;
  setIcon(t.content.querySelector('svg')!, ICON[id]);
  t.content.querySelector('.opt-title')!.textContent = SOURCE_TITLES[id];
  t.content.querySelector('.opt-desc')!.textContent = setupHint(id);
  return t.content;
}

/**
 * Custom select (ARIA listbox pattern). Collapsed, it shows only the chosen source and a caret;
 * open, it lists every source. Keyboard: Enter/Space/arrows open; arrows, Home and End move;
 * Enter or Space picks; Escape or Tab closes.
 */
export class SourceSelect {
  private readonly trigger: HTMLButtonElement;
  private readonly menu: HTMLUListElement;
  private readonly options: HTMLLIElement[];
  private value: SourceId;
  private active = 0;

  constructor(
    root: HTMLElement,
    labelId: string,
    private readonly sources: readonly SourceId[],
    initial: SourceId,
    private readonly onPick: (id: SourceId) => void,
  ) {
    this.value = initial;
    root.classList.add('select');

    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.id = `${root.id}-trigger`;
    this.trigger.className = 'select-trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-labelledby', `${labelId} ${this.trigger.id}`);

    this.menu = document.createElement('ul');
    this.menu.id = `${root.id}-menu`;
    this.menu.className = 'select-menu';
    this.menu.tabIndex = -1;
    this.menu.hidden = true;
    this.menu.setAttribute('role', 'listbox');
    this.menu.setAttribute('aria-labelledby', labelId);
    this.trigger.setAttribute('aria-controls', this.menu.id);

    this.options = sources.map((id, i) => {
      const li = document.createElement('li');
      li.id = `${root.id}-${id}`;
      li.className = 'select-option';
      li.dataset.value = id;
      li.setAttribute('role', 'option');
      li.append(row(id));
      li.addEventListener('click', () => this.pick(i));
      li.addEventListener('pointermove', () => this.highlight(i));
      return li;
    });
    this.menu.append(...this.options);
    root.append(this.trigger, this.menu);

    this.trigger.addEventListener('click', () =>
      this.menu.hidden ? this.open() : this.close(false),
    );
    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.open();
      }
    });
    this.menu.addEventListener('keydown', (e) => this.onKey(e));
    this.menu.addEventListener('focusout', (e) => {
      if (!root.contains(e.relatedTarget as Node | null)) this.close(false);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.menu.hidden && !root.contains(e.target as Node)) this.close(false);
    });
    this.set(initial);
  }

  /** Reflects an external change without firing onPick. */
  set(id: SourceId): void {
    this.value = id;
    this.trigger.replaceChildren(row(id));
    this.trigger.insertAdjacentHTML(
      'beforeend',
      '<svg class="icon caret" viewBox="0 0 24 24" aria-hidden="true"></svg>',
    );
    setIcon(this.trigger.lastElementChild!, 'caret');
    for (const o of this.options) o.setAttribute('aria-selected', String(o.dataset.value === id));
  }

  private open(): void {
    this.menu.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    // Open upward when the menu would run off the bottom and there is more room above.
    const box = this.trigger.getBoundingClientRect();
    const below = window.innerHeight - box.bottom;
    this.menu.classList.toggle('up', this.menu.offsetHeight + 8 > below && box.top > below);
    this.highlight(Math.max(0, this.sources.indexOf(this.value)));
    this.menu.focus();
  }

  private close(refocus: boolean): void {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    if (refocus) this.trigger.focus();
  }

  private highlight(i: number): void {
    this.active = i;
    for (const [j, o] of this.options.entries()) o.classList.toggle('active', j === i);
    this.menu.setAttribute('aria-activedescendant', this.options[i]!.id);
  }

  private pick(i: number): void {
    const id = this.sources[i]!;
    this.set(id);
    this.close(true);
    this.onPick(id);
  }

  private onKey(e: KeyboardEvent): void {
    const last = this.options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, this.active + 1),
      ArrowUp: Math.max(0, this.active - 1),
      Home: 0,
      End: last,
    };
    const next = moves[e.key];
    // Keys handled here never reach the global shortcuts.
    if (next !== undefined || ['Enter', ' ', 'Escape'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (next !== undefined) this.highlight(next);
    else if (e.key === 'Enter' || e.key === ' ') this.pick(this.active);
    else if (e.key === 'Escape') this.close(true);
    else if (e.key === 'Tab') this.close(false);
  }
}
