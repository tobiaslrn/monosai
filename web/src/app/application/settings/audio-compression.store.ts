import { Injectable, computed, inject, signal } from '@angular/core';
import { AUDIO_DECODER, SPEECH_ENCODER } from '../shared/ai-tokens';
import { parseWave } from '../../domain/audio/wave';
import type { AudioAsset } from '../../domain/enrichment/records';
import { ENRICHMENT_REPOSITORY } from '../shared/repository-tokens';
import { AudioPlaybackStore } from '../audio/audio-playback.store';

/** How many clips are looked at per metadata read. */
const BATCH = 25;

export type AudioCompressionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly done: number; readonly total: number }
  | {
      readonly kind: 'finished';
      readonly compressed: number;
      readonly skipped: number;
      readonly freedBytes: number;
    };

/**
 * Compressing clips that were stored before Monosai compressed them.
 *
 * Speech is compressed on the way in now, but a learner's existing library was
 * written uncompressed, and that is where the space actually went. This walks
 * those rows and re-encodes them in place.
 *
 * It is a background maintenance pass, deliberately not a schema migration: a
 * migration that has to encode hundreds of clips before the application opens
 * is a migration that can leave it unopenable. Here, every clip is independent,
 * stopping costs nothing, and the work left is simply whatever is still
 * uncompressed the next time it runs.
 *
 * No clip is ever deleted and none is replaced except while it is still exactly
 * the clip that was read, so an interrupted pass, a second tab, or a sentence
 * regenerated mid-pass all leave stored audio intact.
 */
@Injectable({ providedIn: 'root' })
export class AudioCompressionStore {
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly encoder = inject(SPEECH_ENCODER);
  private readonly decoder = inject(AUDIO_DECODER);
  private readonly playback = inject(AudioPlaybackStore);
  private readonly stateSignal = signal<AudioCompressionState>({ kind: 'idle' });
  private controller: AbortController | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly running = computed(() => this.stateSignal().kind === 'running');

  /** Asks the pass to stop after the clip it is on. */
  stop(): void {
    this.controller?.abort();
  }

  /**
   * Re-encodes every uncompressed clip.
   *
   * Resolves when there is nothing left to do, when it is stopped, or at the
   * first failure that is not about one clip. Safe to call again afterwards:
   * the work is recomputed from what is still stored.
   */
  async run(): Promise<void> {
    if (this.stateSignal().kind === 'running') {
      return;
    }
    const controller = new AbortController();
    this.controller = controller;

    const keys = await this.enrichment.listAudioCacheKeys();
    if (!keys.ok) {
      this.controller = null;
      return;
    }

    const pending = await this.findUncompressed(keys.value, controller.signal);
    if (pending.length === 0) {
      this.controller = null;
      this.stateSignal.set({ kind: 'idle' });
      return;
    }

    this.stateSignal.set({ kind: 'running', done: 0, total: pending.length });
    let compressed = 0;
    let skipped = 0;
    let freedBytes = 0;

    for (const [index, cacheKey] of pending.entries()) {
      if (controller.signal.aborted) {
        break;
      }
      // Nothing competes with the reader for the codec: a learner listening is
      // doing the thing the clips exist for, and this can wait for them.
      if (this.playback.isActive()) {
        break;
      }
      const outcome = await this.compressOne(cacheKey, controller.signal);
      if (outcome === 'compressed-none') {
        skipped += 1;
      } else if (outcome !== 'stopped') {
        compressed += 1;
        freedBytes += outcome;
      }
      this.stateSignal.set({ kind: 'running', done: index + 1, total: pending.length });
      await this.yieldToTheBrowser();
    }

    this.controller = null;
    this.stateSignal.set({ kind: 'finished', compressed, skipped, freedBytes });
  }

  /**
   * Which stored clips are still uncompressed.
   *
   * Paged, because a clip's metadata shares its row with its bytes: reading the
   * table's metadata in one go would read every clip in it.
   */
  private async findUncompressed(
    cacheKeys: readonly string[],
    signal: AbortSignal,
  ): Promise<string[]> {
    const pending: string[] = [];
    for (let at = 0; at < cacheKeys.length; at += BATCH) {
      if (signal.aborted) {
        return pending;
      }
      const summaries = await this.enrichment.listAudioSummariesForCacheKeys(
        cacheKeys.slice(at, at + BATCH),
      );
      if (!summaries.ok) {
        // One unreadable row must not decide that the whole library is already
        // compressed. The rest of the table is still worth walking, and the
        // clips in this batch are left exactly as they are.
        continue;
      }
      for (const summary of summaries.value) {
        if (summary.mimeType === 'audio/wav') {
          pending.push(summary.cacheKey);
        }
      }
      await this.yieldToTheBrowser();
    }
    return pending;
  }

  /**
   * One clip: read, re-encode, and replace only if it is still what was read.
   *
   * Returns the bytes reclaimed, or `'compressed-none'` for a clip that was
   * deliberately left alone. A clip this cannot handle is never a failure of
   * the pass — it stays exactly as it is and the pass moves on.
   */
  private async compressOne(
    cacheKey: string,
    signal: AbortSignal,
  ): Promise<number | 'compressed-none' | 'stopped'> {
    const loaded = await this.enrichment.getAudioByCacheKey(cacheKey);
    if (!loaded.ok || loaded.value?.mimeType !== 'audio/wav') {
      return 'compressed-none';
    }
    const asset: AudioAsset = loaded.value;

    let samples: Int16Array<ArrayBuffer>;
    let sampleRate: number;
    let channels: number;
    try {
      const wave = parseWave(await asset.blob.arrayBuffer());
      if (wave.format.bitsPerSample !== 16) {
        return 'compressed-none';
      }
      const copy = wave.data.slice();
      samples = new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2);
      sampleRate = wave.format.sampleRate;
      channels = wave.format.channels;
    } catch {
      // Not a container this understands. Leaving it alone is the whole point.
      return 'compressed-none';
    }

    const encoded = await this.encoder.encode({ samples, sampleRate, channels }, signal);
    if (!encoded.ok) {
      return encoded.error.code === 'cancelled' ? 'stopped' : 'compressed-none';
    }
    if (encoded.value.bytes.byteLength >= asset.byteLength) {
      // Nothing gained. Keeping the original avoids paying a re-encode's
      // quality for no room.
      return 'compressed-none';
    }
    // Proved playable before it replaces audio the learner already paid for.
    // This pass rewrites a whole library unattended, so a clip that cannot be
    // decoded has to stop at the one clip rather than become the library.
    if (!(await this.decoder.canDecode(encoded.value.bytes, encoded.value.mimeType))) {
      return 'compressed-none';
    }

    const replaced = await this.enrichment.replaceAudioBytes({
      cacheKey,
      expectedMimeType: asset.mimeType,
      expectedByteLength: asset.byteLength,
      bytes: encoded.value.bytes,
      mimeType: encoded.value.mimeType,
    });
    if (!replaced.ok || replaced.value === 'skipped') {
      return 'compressed-none';
    }
    return asset.byteLength - encoded.value.bytes.byteLength;
  }

  /** Hands the thread back, so a long pass never holds a frame. */
  private yieldToTheBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
