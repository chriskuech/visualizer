import type { AppController } from './controller';

/** Global shortcuts: T/Space tap, Left/Right lag (shift: 10 ms), F fullscreen, 1..n visual. */
export function bindKeyboard(controller: AppController): void {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const editing =
      t instanceof HTMLInputElement ||
      t instanceof HTMLSelectElement ||
      t instanceof HTMLTextAreaElement;
    const key = e.key;
    if (key === 't' || key === 'T' || key === ' ') {
      // Space on a focused button presses that button instead.
      if (editing || e.repeat || (key === ' ' && t instanceof HTMLButtonElement)) return;
      e.preventDefault();
      controller.tap(e.timeStamp);
    } else if (editing) {
      return;
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault();
      controller.nudgeLag((key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    } else if (key === 'f' || key === 'F') {
      e.preventDefault();
      controller.toggleFullscreen();
    } else if (/^[1-9]$/.test(key)) {
      controller.selectVisualizerByIndex(Number(key) - 1);
    }
  });
}
