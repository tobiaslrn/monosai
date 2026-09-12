import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AudioCompressionStore } from './audio-compression.store';
import { AUDIO_DECODER, SPEECH_ENCODER } from '../shared/ai-tokens';
import { ENRICHMENT_REPOSITORY } from '../shared/repository-tokens';
import { AudioPlaybackStore } from '../audio/audio-playback.store';
import { FakeEnrichmentRepository } from '../../../testing/enrichment-fakes';
import { fakeAudioDecoder, fakeSpeechEncoder } from '../../../testing/ai-fakes';
import type { AudioAsset, AudioMimeType } from '../../domain/enrichment/records';
import { assetId, readingId, sentenceId } from '../../domain/shared/ids';

/** A 16-bit mono PCM WAV of `frames` samples, as a stored Gemini clip is. */
function wavBytes(frames: number): Uint8Array<ArrayBuffer> {
  const dataBytes = frames * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, out.byteLength - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24_000, true);
  view.setUint32(28, 48_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(out);
}

function clip(index: number, mimeType: AudioMimeType = 'audio/wav', frames = 600): AudioAsset {
  const bytes: Uint8Array<ArrayBuffer> =
    mimeType === 'audio/wav' ? wavBytes(frames) : new Uint8Array(new ArrayBuffer(64));
  return {
    id: assetId(`asset-${String(index)}`),
    sentenceId: sentenceId(`sentence-${String(index)}`),
    readingId: readingId('reading-1'),
    sourceContentHash: `hash-${String(index)}`,
    modelId: 'google/gemini-tts',
    voiceId: 'kore',
    optionsFingerprint: 'fingerprint',
    mimeType,
    byteLength: bytes.byteLength,
    blob: new Blob([bytes], { type: mimeType }),
    cacheKey: `clip-${String(index)}`,
    createdAt: 1_700_000_000_000 + index,
  };
}

describe('AudioCompressionStore', () => {
  let repository: FakeEnrichmentRepository;
  let playing: boolean;

  function build(
    options: { encoder?: 'encodes' | 'unsupported' | 'fails'; decodable?: boolean } = {},
  ) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ENRICHMENT_REPOSITORY, useValue: repository },
        { provide: SPEECH_ENCODER, useValue: fakeSpeechEncoder(options.encoder ?? 'encodes') },
        { provide: AUDIO_DECODER, useValue: fakeAudioDecoder(options.decodable ?? true) },
        { provide: AudioPlaybackStore, useValue: { isActive: () => playing } },
      ],
    });
    return TestBed.inject(AudioCompressionStore);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    repository = new FakeEnrichmentRepository();
    playing = false;
  });

  it('compresses stored WAV clips and reports what it reclaimed', async () => {
    repository.audio = [clip(0), clip(1)];

    const store = build();
    await store.run();

    const state = store.state();
    expect(state.kind).toBe('finished');
    if (state.kind !== 'finished') {
      return;
    }
    expect(state.compressed).toBe(2);
    expect(state.freedBytes).toBeGreaterThan(0);
    expect(repository.audio.every((asset) => asset.mimeType === 'audio/webm')).toBe(true);
  });

  it('leaves clips that are already compressed alone', async () => {
    repository.audio = [clip(0, 'audio/mpeg'), clip(1, 'audio/webm')];

    const store = build();
    await store.run();

    expect(store.state()).toStrictEqual({ kind: 'idle' });
    expect(repository.audio.map((asset) => asset.mimeType)).toStrictEqual([
      'audio/mpeg',
      'audio/webm',
    ]);
  });

  it('keeps the original when the browser has no encoder', async () => {
    repository.audio = [clip(0)];

    const store = build({ encoder: 'unsupported' });
    await store.run();

    expect(repository.audio[0].mimeType).toBe('audio/wav');
    const state = store.state();
    expect(state.kind === 'finished' && state.compressed).toBe(0);
  });

  it('keeps the original when the re-encoded clip will not decode', async () => {
    repository.audio = [clip(0)];

    const store = build({ decodable: false });
    await store.run();

    // The guard that stops a bad encode becoming the library.
    expect(repository.audio[0].mimeType).toBe('audio/wav');
    expect(repository.audio[0].byteLength).toBe(clip(0).byteLength);
  });

  it('keeps the original when an encode fails, and carries on with the rest', async () => {
    repository.audio = [clip(0)];

    const store = build({ encoder: 'fails' });
    await store.run();

    expect(repository.audio[0].mimeType).toBe('audio/wav');
    const state = store.state();
    expect(state.kind === 'finished' && state.skipped).toBe(1);
  });

  it('waits rather than competing with a learner who is listening', async () => {
    repository.audio = [clip(0), clip(1)];
    playing = true;

    const store = build();
    await store.run();

    expect(repository.audio.every((asset) => asset.mimeType === 'audio/wav')).toBe(true);
  });

  it('leaves a clip that is not 16-bit PCM exactly as it is', async () => {
    const odd = clip(0);
    const bytes = wavBytes(600);
    new DataView(bytes.buffer).setUint16(34, 8, true); // 8-bit samples
    repository.audio = [{ ...odd, blob: new Blob([bytes], { type: 'audio/wav' }) }];

    const store = build();
    await store.run();

    expect(repository.audio[0].mimeType).toBe('audio/wav');
  });

  it('does nothing when there is nothing stored', async () => {
    const store = build();
    await store.run();

    expect(store.state()).toStrictEqual({ kind: 'idle' });
  });
});
