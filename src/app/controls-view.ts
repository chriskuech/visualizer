import type { Store } from '../core/store';
import { SOURCE_LABELS, type SourceId } from '../services/audio-source';
import type { CaptureSession } from '../services/capture-session';
import { Fullscreen } from '../services/fullscreen';
import { findVisualizer, VISUALIZERS } from '../visualizers';
import type { AppController } from './controller';
import { calibrationCopy, TAP_PROMPT } from './copy';
import { announce, byId } from './dom';
import { FloatingPanel } from './floating-panel';
import { type IconName, setIcon } from './icons';
import { Popovers } from './popovers';
import type { AppState } from './state';

const SOURCE_ICONS: Record<SourceId, IconName> = {
  display: 'display',
  microphone: 'microphone',
  file: 'file',
};
const SCALES = [
  { value: 1, label: '100%' },
  { value: 0.75, label: '75%' },
  { value: 0.5, label: '50%' },
] as const;

/** Sets the tooltip and the accessible name together, so they never disagree. */
function setTip(fab: HTMLElement, text: string): void {
  fab.dataset.tip = text;
  fab.setAttribute('aria-label', text);
}

/** A radio row: `<label class="option"><input type=radio> [icon] text</label>`. */
function option(name: string, value: string, text: string, icon?: IconName): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'option';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  label.append(input);
  if (icon) {
    label.insertAdjacentHTML(
      'beforeend',
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"></svg>',
    );
    setIcon(label.lastElementChild!, icon);
  }
  label.append(text);
  return label;
}

function radioGroup(container: HTMLElement, name: string, onPick: (value: string) => void) {
  container.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.name === name) onPick(t.value);
  });
  return (value: string) => {
    for (const input of container.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
      input.checked = input.value === value;
  };
}

/**
 * Floating action buttons: Source, Lag and Visual open popovers; Stop/Resume and Fullscreen act
 * directly. Every FAB is an icon with a tooltip that also states its current value.
 */
export function mountControlsView(
  sources: readonly SourceId[],
  store: Store<AppState>,
  session: CaptureSession,
  controller: AppController,
): FloatingPanel {
  const app = byId('app');
  const bar = byId('panel');
  const panel = new FloatingPanel(bar);
  const popovers = new Popovers(bar);
  const fab = {
    source: byId<HTMLButtonElement>('fab-source'),
    lag: byId<HTMLButtonElement>('fab-lag'),
    visual: byId<HTMLButtonElement>('fab-visual'),
    stop: byId<HTMLButtonElement>('fab-stop'),
    fullscreen: byId<HTMLButtonElement>('fullscreen'),
  };
  popovers.register('source', fab.source, byId('pop-source'));
  popovers.register('lag', fab.lag, byId('pop-lag'));
  popovers.register('visual', fab.visual, byId('pop-visual'));
  panel.onChange((visible) => visible || popovers.close());
  setIcon(byId('source-icon'), 'source');
  setIcon(byId('lag-icon'), 'lag');
  setIcon(byId('visual-icon'), 'visual');

  // ---- Source
  const sourceOptions = byId('source-options');
  sourceOptions.replaceChildren(
    ...sources.map((id) => option('source', id, SOURCE_LABELS[id], SOURCE_ICONS[id])),
  );
  const checkSource = radioGroup(sourceOptions, 'source', (id) => {
    popovers.close();
    controller.start(id as SourceId);
  });
  const deviceWrap = byId('device-wrap');
  const device = byId<HTMLSelectElement>('device');
  device.addEventListener('change', () => controller.setDevice(device.value));
  store.select(
    (s) => s.sourceId,
    (id) => {
      checkSource(id);
      setTip(fab.source, `Source: ${SOURCE_LABELS[id]}`);
    },
  );
  const denoise = byId<HTMLInputElement>('denoise');
  denoise.addEventListener('change', () => controller.setDenoise(denoise.checked));
  store.select(
    (s) => s.denoise,
    (on) => {
      denoise.checked = on;
    },
  );
  store.select(
    (s) => s.devices,
    (devices) => {
      const selected = store.get().deviceId;
      device.replaceChildren(
        ...devices.map((d) => new Option(d.label, d.id, false, d.id === selected)),
      );
    },
  );
  store.select(
    (s) => s.sourceId === 'microphone' && s.devices.length > 0,
    (show) => (deviceWrap.hidden = !show),
  );

  // ---- Lag
  const slider = byId<HTMLInputElement>('lag-slider');
  const number = byId<HTMLInputElement>('lag-number');
  const tapStatus = byId('tap-status');
  const tapButton = byId('tap');
  tapButton.addEventListener('click', (e) => controller.tap(e.timeStamp));
  byId('lag-clear').addEventListener('click', () => controller.clearLag());
  slider.addEventListener('input', () => controller.setLag(Number(slider.value)));
  number.addEventListener(
    'input',
    () => number.value !== '' && controller.setLag(Number(number.value)),
  );
  number.addEventListener('change', () => controller.setLag(Number(number.value)));
  for (const input of [slider, number])
    input.addEventListener('keydown', (e) => {
      // Native arrows step 1; shift+arrow steps 10.
      const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (dir === undefined || !e.shiftKey) return;
      if (input === number && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      e.preventDefault();
      controller.nudgeLag(dir * 10);
    });
  store.select(
    (s) => s.lagMs,
    (lag) => {
      slider.value = String(lag);
      if (document.activeElement !== number || Number(number.value) !== lag)
        number.value = String(lag);
      setTip(fab.lag, `Lag: ${lag} ms (T to tap)`);
    },
  );
  store.select(
    (s) => s.calibration,
    (r) => {
      tapStatus.classList.remove('ok', 'warn');
      tapStatus.textContent = TAP_PROMPT;
      if (!r) return;
      // Show progress while tapping, without taking focus (T keeps working).
      popovers.open('lag', false);
      // Keyboard taps press the circle visibly too.
      tapButton.classList.add('pressed');
      window.setTimeout(() => tapButton.classList.remove('pressed'), 80);
      const phase = session.state.get().phase;
      const copy = calibrationCopy(r, phase.kind === 'running' && phase.source.kind === 'acoustic');
      tapStatus.textContent = copy.text;
      if (copy.tone !== 'info') tapStatus.classList.add(copy.tone);
      if (copy.tone === 'ok') announce(copy.text);
    },
  );

  // ---- Visual (render quality lives in the lag popover, with the other performance settings)
  const visualOptions = byId('visualizer-options');
  visualOptions.replaceChildren(
    ...VISUALIZERS.map((v, i) => option('visualizer', v.id, `${v.name}  (${i + 1})`)),
  );
  const checkVisual = radioGroup(visualOptions, 'visualizer', (id) =>
    controller.selectVisualizer(id),
  );
  const scaleOptions = byId('scale-options');
  scaleOptions.replaceChildren(...SCALES.map((s) => option('scale', String(s.value), s.label)));
  const checkScale = radioGroup(scaleOptions, 'scale', (v) => controller.setRenderScale(Number(v)));
  store.select(
    (s) => s.visualizer,
    (id) => {
      checkVisual(id);
      setTip(fab.visual, `Visual: ${findVisualizer(id).name}`);
    },
  );
  store.select(
    (s) => s.renderScale,
    (v) => checkScale(String(v)),
  );

  // ---- Stop / Resume
  fab.stop.addEventListener('click', () => controller.toggleRunning());
  session.state.select(
    (s) => s.phase.kind === 'running' || s.phase.kind === 'starting',
    (active) => {
      setIcon(byId('stop-icon'), active ? 'stop' : 'play');
      setTip(fab.stop, active ? 'Stop' : 'Resume');
    },
  );

  // ---- Fullscreen
  fab.fullscreen.hidden = !Fullscreen.supported;
  fab.fullscreen.addEventListener('click', () => controller.toggleFullscreen());
  byId('stage').addEventListener('dblclick', () => controller.toggleFullscreen());
  const updateCursor = () =>
    app.classList.toggle('cursor-hidden', store.get().fullscreen && !panel.isVisible);
  panel.onChange(updateCursor);
  store.select(
    (s) => s.fullscreen,
    (fs) => {
      fab.fullscreen.setAttribute('aria-pressed', String(fs));
      setIcon(byId('fullscreen-icon'), fs ? 'fullscreenExit' : 'fullscreen');
      setTip(fab.fullscreen, fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)');
      updateCursor();
    },
  );

  // A new capture starts a fresh tap session.
  session.state.select(
    (s) => s.phase.kind === 'running',
    (running) => running && store.set({ calibration: null }),
  );
  store.select(
    (s) => s.started,
    (started) => panel.setEnabled(started),
  );
  return panel;
}
