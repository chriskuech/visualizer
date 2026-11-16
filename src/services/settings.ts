/** Key-value persistence, injected so tests and other hosts can replace localStorage. */
export interface Settings {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage-backed settings. Every access is guarded: storage may be unavailable. */
export const localSettings: Settings = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

export function getNumber(
  s: Settings,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = s.get(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
