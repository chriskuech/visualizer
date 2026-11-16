import type { CalibrationResult } from '../core/calibrate';
import { CALIBRATION } from '../core/calibrate';
import type { SourceId } from '../services/audio-source';
import type { CaptureError } from '../services/capture-session';

/** All user-facing wording in one place. */

/** Short names for the source picker; the setup hint is the description. */
export const SOURCE_TITLES: Record<SourceId, string> = {
  display: 'System audio',
  microphone: 'Microphone',
  file: 'Audio file',
};

export function setupHint(source: SourceId): string {
  switch (source) {
    case 'display':
      return 'Choose Entire Screen and tick Share system audio.';
    case 'microphone':
      return 'Uses your microphone. Play audio out loud.';
    case 'file':
      return 'Pick a file when you press play, or drop one anywhere on the page.';
  }
}

export type RecoveryAction = 'retry' | 'use-microphone' | 'choose-file';

export interface ErrorCopy {
  text: string;
  actions: readonly { label: string; action: RecoveryAction }[];
}

export function errorCopy(
  error: CaptureError,
  source: SourceId,
  detail: string,
  micAvailable: boolean,
): ErrorCopy {
  const what = source === 'display' ? 'screen sharing' : 'the microphone';
  const retry = { label: 'Retry', action: 'retry' } as const;
  const mic =
    micAvailable && source !== 'microphone'
      ? [{ label: 'Use the microphone', action: 'use-microphone' } as const]
      : [];
  switch (error) {
    case 'permission-denied':
      return {
        text: `Permission for ${what} was denied or the picker was closed. To re-enable it, open the browser's site settings (the icon left of the address bar), allow ${what}, then retry.`,
        actions: [retry],
      };
    case 'no-audio':
      return {
        text: "No audio was shared. Tick 'Share system audio' in the picker.",
        actions: [retry, ...mic],
      };
    case 'ended':
      return { text: 'Capture stopped.', actions: [{ label: 'Start again', action: 'retry' }] };
    case 'not-found':
      return { text: 'No audio input device was found. Connect one and retry.', actions: [retry] };
    case 'decode':
      return {
        text: 'That file could not be decoded as audio.',
        actions: [{ label: 'Choose another file', action: 'choose-file' }],
      };
    case 'unsupported':
      return { text: `This browser cannot capture from ${what}.`, actions: mic };
    default:
      return { text: `Could not start: ${detail || 'unknown error'}.`, actions: [retry] };
  }
}

export const SILENCE_HINT =
  'No sound is coming in. Check that the right tab or screen is shared, that the system is not muted, or whether the content is DRM-protected (it captures as silence).';

export const TAP_PROMPT = `Tap at least ${CALIBRATION.minTaps} times in time with the beat.`;

export function calibrationCopy(
  r: CalibrationResult,
  acoustic: boolean,
): { text: string; tone: 'info' | 'ok' | 'warn' } {
  const pct = Math.round(r.confidence * 100);
  if (r.taps < CALIBRATION.minTaps)
    return { text: `${r.taps} / ${CALIBRATION.minTaps} taps · ${pct}% confident`, tone: 'info' };
  if (!r.ok)
    return {
      text: `${r.taps} taps · ${pct}%. Low confidence: tap steadily or try a track with a clearer beat`,
      tone: 'warn',
    };
  const msg = r.clamped
    ? 'Visuals cannot be advanced, so lag is set to 0 ms'
    : acoustic
      ? `Lag set to ${r.lagMs} ms (microphone mode is usually near 0)`
      : `Lag set to ${r.lagMs} ms`;
  return { text: `${r.taps} taps · ${pct}%. ${msg}. Watch the beat dot.`, tone: 'ok' };
}

export const MIN_VERSIONS = [
  'Chrome or Edge 84 or later (system audio on macOS needs Chrome 141+ on macOS 14.2+)',
  'Firefox 126 or later (microphone)',
  'Safari 16.4 or later (microphone)',
] as const;
