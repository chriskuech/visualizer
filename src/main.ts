/**
 * Composition root. Every object is created here and handed its dependencies through its
 * constructor; nothing else constructs services. Swap any of them (e.g. in tests) by changing
 * what is passed in.
 */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { AppController } from './app/controller';
import { mountControlsView } from './app/controls-view';
import { byId } from './app/dom';
import { filePicker } from './app/file-picker';
import { mountHudView } from './app/hud-view';
import { bindKeyboard } from './app/keyboard';
import { mountMessageView } from './app/message-view';
import { SleepController } from './app/sleep';
import { mountStartView } from './app/start-view';
import { createAppStore } from './app/state';
import { renderUnsupported } from './app/unsupported-view';
import { TapCalibrator } from './core/calibrate';
import { LagBuffer } from './core/lag-buffer';
import { MainThreadAnalyzer, WorkletAnalyzer } from './services/analyzer';
import { AudioClock, createAudioContext } from './services/audio-context';
import type { AudioSource } from './services/audio-source';
import {
  availableSources,
  defaultSource,
  detectBrowser,
  missingFeatures,
} from './services/browser';
import { CaptureSession, type SourceRequest } from './services/capture-session';
import { DisplaySource } from './services/display-source';
import { FileSource } from './services/file-source';
import { Fullscreen } from './services/fullscreen';
import { MicrophoneSource } from './services/microphone-source';
import { watchMotionPreference } from './services/motion';
import { Renderer } from './services/renderer';
import { localSettings } from './services/settings';
import { ScreenWakeLock } from './services/wake-lock';

function createSource(request: SourceRequest): AudioSource {
  switch (request.id) {
    case 'display':
      return new DisplaySource();
    case 'microphone':
      return new MicrophoneSource(request.deviceId);
    case 'file':
      return new FileSource(request.file);
  }
}

function boot(): void {
  const sources = availableSources();
  const store = createAppStore(localSettings, sources, defaultSource(detectBrowser()));
  const calibrator = new TapCalibrator();
  const wake = new ScreenWakeLock(import.meta.env.BASE_URL);
  // `?analysis=main` runs the phase 1 AnalyserNode pipeline instead of the worklet.
  const mainThread = new URLSearchParams(location.search).get('analysis') === 'main';

  const session = new CaptureSession({
    createContext: createAudioContext,
    createClock: (ctx) => new AudioClock(ctx),
    createAnalyzer: (ctx) =>
      mainThread ? Promise.resolve(new MainThreadAnalyzer(ctx)) : WorkletAnalyzer.create(ctx),
    createSource,
    wake,
    lagBuffer: new LagBuffer(256),
    calibrator,
    lagMs: () => store.get().lagMs,
  });
  const renderer = new Renderer(byId<HTMLCanvasElement>('stage'), {
    frames: session,
    motion: watchMotionPreference(),
  });
  const controller = new AppController({
    store,
    session,
    calibrator,
    renderer,
    fullscreen: new Fullscreen(byId('app')),
    pickFile: filePicker(byId<HTMLInputElement>('file-input')),
    listDevices: MicrophoneSource.listDevices,
  });

  mountStartView(sources, store, session, controller);
  mountMessageView(store, session, controller, sources.includes('microphone'));
  const panel = mountControlsView(sources, store, session, controller);
  renderer.onTick(mountHudView(store, session, panel));
  bindKeyboard(controller);
  renderer.start();
  new SleepController({ store, session, wake, stage: byId('stage') }).start();

  if (import.meta.env.DEV) Object.assign(window, { store, session, controller });
}

const missing = missingFeatures();
if (missing.length > 0) renderUnsupported(byId('app'), missing);
else boot();
