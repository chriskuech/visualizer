import type { Store } from '../core/store';
import type { CaptureSession } from '../services/capture-session';
import type { RenderTick } from '../services/renderer';
import { byId } from './dom';
import type { FloatingPanel } from './floating-panel';
import type { AppState } from './state';

/** HUD text, the level ring on the source FAB and the beat dot on the lag FAB. Updated from the render loop, only while controls show. */
export function mountHudView(
  store: Store<AppState>,
  session: CaptureSession,
  panel: FloatingPanel,
) {
  const hud = byId('hud');
  const ring = byId('level-ring');
  const beat = byId('beat');
  let textUpdated = 0;
  let beatTimer: number | undefined;
  panel.onChange((visible) => hud.classList.toggle('visible', visible));

  return (tick: RenderTick): void => {
    if (!panel.isVisible) return;
    const phase = session.state.get().phase;
    const running = phase.kind === 'running';
    const level = running ? session.level : 0;
    ring.style.setProperty('--level', level.toFixed(3));
    if (tick.onset) {
      beat.classList.add('on');
      window.clearTimeout(beatTimer);
      beatTimer = window.setTimeout(() => beat.classList.remove('on'), 90);
    }
    const now = performance.now();
    if (now - textUpdated > 250) {
      textUpdated = now;
      const label = running ? phase.source.label : 'no source';
      hud.textContent = `lag ${store.get().lagMs} ms · ${label} · ${Math.round(tick.fps)} fps`;
    }
  };
}
