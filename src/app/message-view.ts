import type { Store } from '../core/store';
import type { CaptureSession } from '../services/capture-session';
import type { AppController } from './controller';
import { errorCopy, SILENCE_HINT } from './copy';
import { announce, button, byId } from './dom';
import type { AppState } from './state';

/** Error card with recovery actions, and the non-blocking silence hint. */
export function mountMessageView(
  store: Store<AppState>,
  session: CaptureSession,
  controller: AppController,
  micAvailable: boolean,
): void {
  const card = byId('message');
  const text = byId('message-text');
  const actions = byId('message-actions');
  const toast = byId('toast');

  session.state.select(
    (s) => s.phase,
    (phase) => {
      if (phase.kind !== 'error') {
        card.hidden = true;
        return;
      }
      const copy = errorCopy(phase.error, phase.source, phase.detail, micAvailable);
      text.textContent = copy.text;
      actions.replaceChildren(
        ...copy.actions.map((a) => button(a.label, () => controller.recover(a.action))),
      );
      card.hidden = false;
      announce(copy.text);
    },
  );
  // Not over the sleep visual: silence there is expected, and a static box would burn in.
  const renderToast = () => {
    const s = session.state.get();
    const show = s.silent && s.phase.kind === 'running' && store.get().visualizer !== 'ember';
    toast.textContent = SILENCE_HINT;
    if (show && toast.hidden) announce(SILENCE_HINT);
    toast.hidden = !show;
  };
  session.state.subscribe(renderToast);
  store.select((s) => s.visualizer, renderToast);
}
