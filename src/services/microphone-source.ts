import {
  type AudioSource,
  type EndReason,
  SOURCE_LABELS,
  SourceError,
  toSourceError,
} from './audio-source';

const PROCESSING_FLAGS = ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const;

export interface InputDevice {
  id: string;
  label: string;
}

/** Microphone or any audio input (including a loopback device the user already has). */
export class MicrophoneSource implements AudioSource {
  readonly id = 'microphone' as const;
  readonly label = SOURCE_LABELS.microphone;
  readonly kind = 'acoustic' as const;
  private stream: MediaStream | null = null;
  private node: MediaStreamAudioSourceNode | null = null;
  private endedCb: ((reason: EndReason) => void) | null = null;
  private stopping = false;

  constructor(private readonly deviceId: string | null = null) {}

  static isAvailable(): boolean {
    return typeof navigator.mediaDevices?.getUserMedia === 'function';
  }

  static async listDevices(): Promise<InputDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
  }

  async start(ctx: AudioContext): Promise<AudioNode> {
    if (!MicrophoneSource.isAvailable()) throw new SourceError('unsupported', 'No getUserMedia');
    const audio: MediaTrackConstraints = {
      // Processing must be off or music is treated as noise.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    };
    if (this.deviceId) audio.deviceId = { exact: this.deviceId };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
      throw toSourceError(err);
    }
    const track = stream.getAudioTracks()[0];
    if (!track) throw new SourceError('no-audio', 'No microphone track');
    if (import.meta.env.DEV) {
      // getSettings() is more reliable than getSupportedConstraints(), which over-reports.
      const settings = track.getSettings();
      for (const flag of PROCESSING_FLAGS)
        if (settings[flag] === true) console.warn(`[microphone] ${flag} is still on`);
    }
    this.stream = stream;
    this.stopping = false;
    track.addEventListener('ended', () => {
      if (!this.stopping) this.endedCb?.('error');
    });
    this.node = ctx.createMediaStreamSource(stream);
    return this.node;
  }

  stop(): void {
    this.stopping = true;
    this.node?.disconnect();
    this.node = null;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
  }

  onEnded(cb: (reason: EndReason) => void): void {
    this.endedCb = cb;
  }
}
