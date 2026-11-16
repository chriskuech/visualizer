import { type AudioSource, type EndReason, SOURCE_LABELS, SourceError } from './audio-source';

/**
 * Decoded audio file, looped. Development, demos and automated tests only; it is not machine
 * audio. Unlike the capture sources, a file has no other way to be heard, so this source also
 * plays itself to the destination. The capture sources never do (that would double the audio).
 */
export class FileSource implements AudioSource {
  readonly id = 'file' as const;
  readonly label: string;
  readonly kind = 'digital' as const;
  private node: AudioBufferSourceNode | null = null;
  private endedCb: ((reason: EndReason) => void) | null = null;

  constructor(private readonly file: Blob & { name?: string }) {
    this.label = file.name ? `${SOURCE_LABELS.file}: ${file.name}` : SOURCE_LABELS.file;
  }

  async start(ctx: AudioContext): Promise<AudioNode> {
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(await this.file.arrayBuffer());
    } catch (err) {
      throw new SourceError('decode', err instanceof Error ? err.message : 'Could not decode file');
    }
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.connect(ctx.destination);
    node.start();
    this.node = node;
    return node;
  }

  stop(): void {
    try {
      this.node?.stop();
    } catch {
      // already stopped
    }
    this.node?.disconnect();
    this.node = null;
  }

  onEnded(cb: (reason: EndReason) => void): void {
    this.endedCb = cb;
    void this.endedCb;
  }
}
