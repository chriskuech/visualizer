/**
 * Custom line icons on a 24x24 grid: 1.5 px strokes, round caps and joins, geometric forms.
 * Shapes with class "f" are filled instead of stroked (transport controls only).
 */
export const ICONS = {
  // A signal radiating from a point: the generic "source" mark.
  source:
    '<circle class="f" cx="12" cy="12" r="2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
  // A screen on a thin stand.
  display: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M12 16.5v3.5M8.5 20h7"/>',
  // Capsule, pickup arc, stem.
  microphone:
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  // A single eighth note.
  file: '<circle cx="8" cy="17.5" r="2.75"/><path d="M10.75 17.5V4.5l7 2"/>',
  // A metronome: timing, as in tapping to the beat.
  lag: '<path d="M9.75 3.5h4.5l4 16.25a.6.6 0 0 1-.58.75H6.33a.6.6 0 0 1-.58-.75z"/><path d="M12 17l4.25-9.5"/><path d="M8 17h8"/>',
  // Three overlapping circles, like additive colour.
  visual:
    '<circle cx="12" cy="8.5" r="5"/><circle cx="8.5" cy="14.5" r="5"/><circle cx="15.5" cy="14.5" r="5"/>',
  // Downward caret for the select.
  caret: '<path d="M7 10l5 5 5-5"/>',
  stop: '<rect class="f" x="7" y="7" width="10" height="10" rx="2"/>',
  play: '<path class="f" d="M8.5 5.8v12.4a1 1 0 0 0 1.52.85l9.6-6.2a1 1 0 0 0 0-1.7l-9.6-6.2a1 1 0 0 0-1.52.85z"/>',
  // Corner marks outward / inward.
  fullscreen:
    '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  fullscreenExit:
    '<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>',
} as const;

export type IconName = keyof typeof ICONS;

/** Replaces the contents of an `<svg class="icon" viewBox="0 0 24 24">` with another icon. */
export function setIcon(svg: Element, name: IconName): void {
  svg.innerHTML = ICONS[name];
}
