import type { TapCalibrator } from '../core/calibrate';
import type { Store } from '../core/store';
import { ms } from '../core/units';
import type { SourceId } from '../services/audio-source';
import type { CaptureSession } from '../services/capture-session';
import type { Fullscreen } from '../services/fullscreen';
import type { InputDevice } from '../services/microphone-source';
import type { Renderer } from '../services/renderer';
import { findVisualizer, VISUALIZERS } from '../visualizers';
import type { RecoveryAction } from './copy';
import { type AppState, LAG_MAX_MS } from './state';

export interface ControllerDeps {
  store: Store<AppState>;
  session: CaptureSession;
  calibrator: TapCalibrator;
  renderer: Renderer;
  fullscreen: Fullscreen;
  /** Opens the file picker synchronously (keep the user gesture); resolves null on cancel. */
  pickFile(): Promise<File | null>;
  listDevices(): Promise<InputDevice[]>;
}

/**
 * Every user intent goes through here. Views call these methods and render from the stores;
 * they never call services directly. Methods that start capture are synchronous so they run
 * inside the user gesture.
 */
export class AppController {
  /** Kept so Resume can restart a file source without picking it again. */
  private lastFile: File | null = null;

  constructor(private readonly deps: ControllerDeps) {
    const { store, session, renderer, fullscreen } = deps;
    fullscreen.onChange((active) => store.set({ fullscreen: active }));
    store.select(
      (s) => s.visualizer,
      (id) => renderer.setVisualizer(findVisualizer(id)),
    );
    store.select(
      (s) => s.renderScale,
      (scale) => renderer.setRenderScale(scale),
    );
    store.select(
      (s) => s.denoise,
      (on) => session.setDenoise(on),
    );
    session.state.select(
      (s) => s.phase,
      (phase) => {
        if (phase.kind === 'running' && phase.source.id === 'microphone')
          void this.refreshDevices();
      },
    );
  }

  start(id: SourceId = this.deps.store.get().sourceId): void {
    const { store, session } = this.deps;
    store.set({ sourceId: id, started: true });
    if (id === 'file') {
      void this.deps.pickFile().then((file) => file && this.startFile(file));
      return;
    }
    void session.start(id === 'display' ? { id } : { id, deviceId: store.get().deviceId });
  }

  startFile(file: File): void {
    this.lastFile = file;
    this.deps.store.set({ sourceId: 'file', started: true });
    void this.deps.session.start({ id: 'file', file });
  }

  recover(action: RecoveryAction): void {
    if (action === 'use-microphone') this.start('microphone');
    else if (action === 'choose-file') this.start('file');
    else this.resume();
  }

  stop(): void {
    this.deps.session.stop();
  }

  /** Restarts the current source (the same file, for the file source). */
  resume(): void {
    const { store } = this.deps;
    if (store.get().sourceId === 'file' && this.lastFile) this.startFile(this.lastFile);
    else this.start();
  }

  /** Stop while running or starting; resume otherwise. */
  toggleRunning(): void {
    const kind = this.deps.session.state.get().phase.kind;
    if (kind === 'running' || kind === 'starting') this.stop();
    else this.resume();
  }

  setDevice(deviceId: string): void {
    this.deps.store.set({ deviceId });
    this.start('microphone');
  }

  setLag(value: number): void {
    const v = Number.isFinite(value) ? value : 0;
    this.deps.store.set({ lagMs: ms(Math.round(Math.min(LAG_MAX_MS, Math.max(0, v)))) });
  }

  nudgeLag(delta: number): void {
    this.setLag(this.deps.store.get().lagMs + delta);
  }

  /** Resets the lag to 0 and discards the current tap session. */
  clearLag(): void {
    this.deps.calibrator.clearTaps();
    this.deps.store.set({ calibration: null });
    this.setLag(0);
  }

  /** `timeStamp` is event.timeStamp (performance clock). */
  tap(timeStamp: number): void {
    const { session, calibrator, store } = this.deps;
    if (session.state.get().phase.kind !== 'running') return;
    const t = session.audioTime(timeStamp);
    if (t === null) return;
    const result = calibrator.tap(t);
    store.set({ calibration: result });
    if (result.ok) this.setLag(result.lagMs);
  }

  selectVisualizer(id: string): void {
    this.deps.store.set({ visualizer: findVisualizer(id).id });
  }

  selectVisualizerByIndex(index: number): void {
    const v = VISUALIZERS[index];
    if (v) this.selectVisualizer(v.id);
  }

  setDenoise(on: boolean): void {
    this.deps.store.set({ denoise: on });
  }

  setRenderScale(scale: number): void {
    this.deps.store.set({ renderScale: scale });
  }

  toggleFullscreen(): void {
    this.deps.fullscreen.toggle();
  }

  private async refreshDevices(): Promise<void> {
    try {
      this.deps.store.set({ devices: await this.deps.listDevices() });
    } catch {
      this.deps.store.set({ devices: [] });
    }
  }
}
