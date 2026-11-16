import type { SourceId } from './audio-source';
import { DisplaySource } from './display-source';

export type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'other';

/** User-agent hint, used only for the setup copy and the default source. */
export function detectBrowser(ua = navigator.userAgent): BrowserFamily {
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/(Chrome|Chromium|Edg)\//.test(ua)) return 'chromium';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

export function defaultSource(browser: BrowserFamily): SourceId {
  return browser === 'chromium' && DisplaySource.isAvailable() ? 'display' : 'microphone';
}

/** Missing AudioWorklet, getUserMedia or WebGL2 means the app cannot run. */
export function missingFeatures(): string[] {
  const missing: string[] = [];
  if (typeof AudioWorkletNode === 'undefined') missing.push('AudioWorklet');
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') missing.push('getUserMedia');
  if (!document.createElement('canvas').getContext('webgl2')) missing.push('WebGL2');
  return missing;
}

export function availableSources(): SourceId[] {
  const ids: SourceId[] = [];
  if (DisplaySource.isAvailable()) ids.push('display');
  if (typeof navigator.mediaDevices?.getUserMedia === 'function') ids.push('microphone');
  ids.push('file');
  return ids;
}
