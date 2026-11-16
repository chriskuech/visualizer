import type { CalibrationResult } from '../core/calibrate';
import { Store } from '../core/store';
import { type Ms, ms } from '../core/units';
import type { SourceId } from '../services/audio-source';
import type { InputDevice } from '../services/microphone-source';
import { getNumber, type Settings } from '../services/settings';
import { VISUALIZERS } from '../visualizers';

/** UI state. Capture state (phase, silence) lives in CaptureSession.state. */
export interface AppState {
  readonly sourceId: SourceId;
  readonly deviceId: string | null;
  readonly devices: readonly InputDevice[];
  readonly lagMs: Ms;
  readonly visualizer: string;
  readonly renderScale: number;
  readonly fullscreen: boolean;
  readonly calibration: CalibrationResult | null;
  /** Noise gate on the analysis, so hiss does not make the visuals jitter. */
  readonly denoise: boolean;
  /** True once the user has started capture; the start screen gives way to the controls. */
  readonly started: boolean;
}

export const LAG_MAX_MS = 1000;

const PERSISTED = {
  lagMs: 'lag',
  visualizer: 'visualizer',
  renderScale: 'renderScale',
  deviceId: 'micDevice',
  sourceId: 'source',
  denoise: 'denoise',
} as const satisfies Partial<Record<keyof AppState, string>>;

/** Loads persisted settings, then saves them whenever they change. */
export function createAppStore(
  settings: Settings,
  available: readonly SourceId[],
  fallback: SourceId,
): Store<AppState> {
  const savedSource = settings.get(PERSISTED.sourceId) as SourceId | null;
  const savedVis = settings.get(PERSISTED.visualizer);
  const store = new Store<AppState>({
    // A file needs picking again each session, so it is never restored.
    sourceId:
      savedSource && savedSource !== 'file' && available.includes(savedSource)
        ? savedSource
        : fallback,
    deviceId: settings.get(PERSISTED.deviceId),
    devices: [],
    lagMs: ms(Math.round(getNumber(settings, PERSISTED.lagMs, 0, 0, LAG_MAX_MS))),
    visualizer: VISUALIZERS.some((v) => v.id === savedVis) ? savedVis! : VISUALIZERS[0]!.id,
    renderScale: getNumber(settings, PERSISTED.renderScale, 1, 0.25, 1),
    fullscreen: false,
    calibration: null,
    denoise: settings.get(PERSISTED.denoise) !== 'false',
    started: false,
  });
  store.subscribe((s, prev) => {
    for (const [field, key] of Object.entries(PERSISTED) as [keyof typeof PERSISTED, string][]) {
      const v = s[field];
      if (v !== prev[field] && v !== null && !(field === 'sourceId' && v === 'file'))
        settings.set(key, String(v));
    }
  });
  return store;
}
