import type { Store } from '../core/store';
import type { SourceId } from '../services/audio-source';
import type { CaptureSession } from '../services/capture-session';
import type { AppController } from './controller';
import { byId } from './dom';
import { setIcon } from './icons';
import { SourceSelect } from './source-select';
import type { AppState } from './state';

/** Splash: title, play button, and the source picker. */
export function mountStartView(
  sources: readonly SourceId[],
  store: Store<AppState>,
  session: CaptureSession,
  controller: AppController,
): void {
  setIcon(byId('start-icon'), 'play');
  byId('start-btn').addEventListener('click', () => controller.start());
  const picker = new SourceSelect(
    byId('start-source'),
    'start-source-label',
    sources,
    store.get().sourceId,
    (id) => store.set({ sourceId: id }),
  );
  store.select(
    (s) => s.sourceId,
    (id) => picker.set(id),
  );

  const root = byId('app');
  session.state.select(
    (s) => s.phase.kind,
    (kind) => {
      root.dataset.phase = kind;
    },
  );
  // After the first start, Stop/Resume lives on the FAB; the splash never returns.
  store.select(
    (s) => s.started,
    (started) => {
      byId('start').hidden = started;
    },
  );

  // Drop an audio file anywhere to use it as the source.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file && (file.type === '' || /^(audio|video)\//.test(file.type)))
      controller.startFile(file);
  });
}
