export type SourceId = 'display' | 'microphone' | 'file';
export type EndReason = 'user' | 'error';

export interface AudioSource {
  readonly id: SourceId;
  readonly label: string;
  /** Latency class. Used only to word the calibration result message. */
  readonly kind: 'digital' | 'acoustic';
  start(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
  onEnded(cb: (reason: EndReason) => void): void;
}

export type SourceErrorCode =
  | 'permission-denied'
  | 'no-audio'
  | 'not-found'
  | 'unsupported'
  | 'decode'
  | 'aborted'
  | 'other';

export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

/** Maps DOMException names from getUserMedia / getDisplayMedia onto our codes. */
export function toSourceError(err: unknown): SourceError {
  if (err instanceof SourceError) return err;
  const name = err instanceof DOMException ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new SourceError('permission-denied', message);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new SourceError('not-found', message);
    case 'NotSupportedError':
    case 'TypeError':
      return new SourceError('unsupported', message);
    case 'AbortError':
      return new SourceError('aborted', message);
    default:
      return new SourceError('other', message);
  }
}

export const SOURCE_LABELS: Record<SourceId, string> = {
  display: 'System audio (screen share)',
  microphone: 'Microphone',
  file: 'Audio file (demo)',
};
