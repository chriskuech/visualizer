import {
  type AudioSource,
  type EndReason,
  SOURCE_LABELS,
  SourceError,
  toSourceError,
} from './audio-source';

/** `systemAudio` is a Chromium extension to DisplayMediaStreamOptions. */
interface ChromiumDisplayOptions extends DisplayMediaStreamOptions {
  systemAudio?: 'include' | 'exclude';
}

/** System audio via screen share. Chromium only; the user must tick "Share system audio". */
export class DisplaySource implements AudioSource {
  readonly id = 'display' as const;
  readonly label = SOURCE_LABELS.display;
  readonly kind = 'digital' as const;
  private stream: MediaStream | null = null;
  private node: MediaStreamAudioSourceNode | null = null;
  private endedCb: ((reason: EndReason) => void) | null = null;
  private stopping = false;

  static isAvailable(): boolean {
    return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  }

  async start(ctx: AudioContext): Promise<AudioNode> {
    if (!DisplaySource.isAvailable()) throw new SourceError('unsupported', 'No getDisplayMedia');
    const options: ChromiumDisplayOptions = {
      video: true, // required by the API; discarded below
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include',
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(options);
    } catch (err) {
      throw toSourceError(err);
    }
    const audio = stream.getAudioTracks();
    if (audio.length === 0) {
      for (const t of stream.getTracks()) t.stop();
      throw new SourceError('no-audio', 'No audio track was shared');
    }
    for (const t of stream.getVideoTracks()) t.stop();
    this.stream = stream;
    this.stopping = false;
    // The user can stop sharing from the browser UI.
    for (const t of audio)
      t.addEventListener('ended', () => {
        if (!this.stopping) this.endedCb?.('user');
      });
    this.node = ctx.createMediaStreamSource(new MediaStream(audio));
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
