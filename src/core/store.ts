/** A small typed store: shallow-merge updates and change listeners. */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<(s: T, prev: T) => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(patch: Partial<T>): void {
    const prev = this.state;
    let changed = false;
    for (const k in patch) if (!Object.is(patch[k], prev[k])) changed = true;
    if (!changed) return;
    this.state = { ...prev, ...patch };
    for (const l of this.listeners) l(this.state, prev);
  }

  subscribe(fn: (s: T, prev: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Calls `fn` now and whenever the selected value changes. */
  select<V>(selector: (s: T) => V, fn: (v: V) => void): () => void {
    let last = selector(this.state);
    fn(last);
    return this.subscribe((s) => {
      const v = selector(s);
      if (!Object.is(v, last)) {
        last = v;
        fn(v);
      }
    });
  }
}
