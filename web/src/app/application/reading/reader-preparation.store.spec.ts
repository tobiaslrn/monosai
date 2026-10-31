import { ApplicationRef, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { readingId } from '../../domain/shared/ids';
import { AudioJobStore } from '../enrichment/audio-job.store';
import { PreparationStore } from '../enrichment/preparation.store';
import { TranslationJobStore } from '../enrichment/translation-job.store';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { LanguageStore } from '../language/language.store';
import { TextModelStore } from '../settings/text-model.store';
import { TtsStore } from '../settings/tts.store';
import { ReaderPreparationStore } from './reader-preparation.store';
import { ReaderStore } from './reader.store';

const ID = readingId('r1');
const IDLE = { kind: 'idle' };

describe('ReaderPreparationStore', () => {
  let translation: WritableSignal<{ kind: string; step?: number }>;
  let audio: WritableSignal<{ kind: string; step?: number }>;
  let grammar: WritableSignal<{ kind: string; step?: number }>;
  let reading: WritableSignal<{ id: typeof ID } | null>;
  let refreshSummaries: ReturnType<typeof vi.fn>;

  const settled = () => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(() => {
    translation = signal(IDLE);
    audio = signal(IDLE);
    grammar = signal(IDLE);
    reading = signal(null);
    // Replacing the row is what a real refresh does, and what must not retrigger.
    refreshSummaries = vi.fn(() => {
      reading.set({ id: ID });
      return Promise.resolve();
    });

    TestBed.configureTestingModule({
      providers: [
        ReaderPreparationStore,
        { provide: ReaderStore, useValue: { reading, refreshSummaries } },
        {
          provide: PreparationStore,
          useValue: {
            progressFor: () => grammar(),
            setOpenReading: () => undefined,
            reconcile: () => Promise.resolve(),
          },
        },
        { provide: TranslationJobStore, useValue: { progressFor: () => translation() } },
        { provide: AudioJobStore, useValue: { progressFor: () => audio() } },
        { provide: TextModelStore, useValue: {} },
        { provide: TtsStore, useValue: {} },
        { provide: GrammarProfileStore, useValue: { load: () => Promise.resolve() } },
        { provide: LanguageStore, useValue: { initialize: () => Promise.resolve(true) } },
        { provide: NETWORK_STATUS, useValue: { isOnline: () => true } },
      ],
    });
    TestBed.inject(ReaderPreparationStore);
  });

  it('does not re-read while every job is idle', async () => {
    reading.set({ id: ID });
    await settled();

    expect(refreshSummaries).not.toHaveBeenCalled();
  });

  it('does not re-read for a job before a reading has opened', async () => {
    audio.set({ kind: 'running', step: 1 });
    await settled();

    expect(refreshSummaries).not.toHaveBeenCalled();
  });

  it.each([
    ['translation', () => translation],
    ['audio', () => audio],
    ['grammar', () => grammar],
  ])('re-reads on every step of a %s job, without looping', async (_name, job) => {
    reading.set({ id: ID });
    await settled();

    job().set({ kind: 'running', step: 1 });
    await settled();
    expect(refreshSummaries).toHaveBeenCalledTimes(1);

    job().set({ kind: 'running', step: 2 });
    await settled();
    expect(refreshSummaries).toHaveBeenCalledTimes(2);
  });

  it('stops re-reading once the reading is closed', async () => {
    reading.set({ id: ID });
    await settled();
    reading.set(null);

    audio.set({ kind: 'running', step: 1 });
    await settled();

    expect(refreshSummaries).not.toHaveBeenCalled();
  });
});
