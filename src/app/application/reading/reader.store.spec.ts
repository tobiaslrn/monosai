import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOCK, READING_REPOSITORY } from '../shared/repository-tokens';
import { fixedClock } from '../../domain/shared/clock';
import { readingId } from '../../domain/shared/ids';
import { ok, type Result } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { buildReading, FakeReadingRepository } from '../../../testing/reading-repository-fake';
import type { LanguageError } from '../../domain/language/language-error';
import { PROGRESS_DEBOUNCE_MS, ReaderStore } from './reader.store';
import {
  VOCABULARY_NOT_CONFIGURED,
  VocabularyClassificationService,
  type VocabularyStatus,
} from './vocabulary-classification.service';

/** Stub that skips the settings/vocabulary dependency chain entirely. */
class StubVocabularyClassificationService {
  status: VocabularyStatus = VOCABULARY_NOT_CONFIGURED;

  classify(): Promise<Result<VocabularyStatus, LanguageError>> {
    return Promise.resolve(ok(this.status));
  }

  invalidate(): void {
    // Nothing to invalidate in the stub.
  }
}

describe('ReaderStore', () => {
  let repository: FakeReadingRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    repository = new FakeReadingRepository();
    TestBed.configureTestingModule({
      providers: [
        ReaderStore,
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000, 1) },
        { provide: READING_REPOSITORY, useValue: repository },
        {
          provide: VocabularyClassificationService,
          useValue: new StubVocabularyClassificationService(),
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function store(): ReaderStore {
    return TestBed.inject(ReaderStore);
  }

  describe('opening and resume basis', () => {
    it('starts at the beginning when the reading has never been opened', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 2 }));
      const reader = store();

      await reader.open(rows.reading.id);

      expect(reader.status()).toBe('ready');
      expect(reader.resumeTarget().basis).toBe('beginning');
      expect(reader.resumeTarget().sentenceId).toBeNull();
    });

    it('resumes exactly when the saved sentence still exists', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 3, sentencesPerParagraph: 2 }),
      );
      const target = rows.sentences[2];
      repository.progress.set(rows.reading.id, {
        readingId: rows.reading.id,
        paragraphId: target.paragraphId,
        sentenceId: target.id,
        positionInReading: target.positionInReading,
        lastOpenedAt: 1,
        updatedAt: 1,
      });
      const reader = store();

      await reader.open(rows.reading.id);

      expect(reader.resumeTarget().basis).toBe('exact');
      expect(reader.resumeTarget().sentenceId).toBe(target.id);
    });

    it('falls back to nearest when the saved sentence no longer matches', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 3, sentencesPerParagraph: 2 }),
      );
      const survivor = rows.sentences[2];
      repository.progress.set(rows.reading.id, {
        readingId: rows.reading.id,
        // A different sentence than the one that resolves at this position, so
        // the location no longer matches the saved identity exactly.
        paragraphId: rows.sentences[0].paragraphId,
        sentenceId: rows.sentences[0].id,
        positionInReading: survivor.positionInReading,
        lastOpenedAt: 1,
        updatedAt: 1,
      });
      const reader = store();

      await reader.open(rows.reading.id);

      expect(reader.resumeTarget().basis).toBe('nearest');
      expect(reader.resumeTarget().sentenceId).toBe(survivor.id);
    });

    it('records opening before the text loads', async () => {
      const rows = repository.add(buildReading({ id: 'r1' }));
      const reader = store();

      await reader.open(rows.reading.id);

      expect(repository.opened).toHaveLength(1);
      expect(repository.opened[0]?.id).toBe(rows.reading.id);
    });

    it('reports not-found for a reading that does not exist', async () => {
      const reader = store();

      await reader.open(readingId('missing'));

      expect(reader.status()).toBe('not-found');
    });

    it('surfaces a storage failure without changing status to ready', async () => {
      const rows = repository.add(buildReading({ id: 'r1' }));
      repository.failGraphWith = storageError('unavailable', 'Storage is unavailable.');
      const reader = store();

      await reader.open(rows.reading.id);

      expect(reader.status()).toBe('failed');
      expect(reader.lastError()?.code).toBe('unavailable');
    });

    it('loads only a bounded window of paragraphs, not the whole reading', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 20 }));
      const reader = store();

      await reader.open(rows.reading.id);

      expect(reader.paragraphs().length).toBeLessThan(20);
      expect(repository.graphRequests.at(-1)).toEqual({
        firstParagraphPosition: 0,
        paragraphCount: 4,
      });
    });
  });

  describe('debounced progress', () => {
    it('does not persist a position until the debounce elapses', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 1, sentencesPerParagraph: 3 }),
      );
      const reader = store();
      await reader.open(rows.reading.id);

      reader.reportPosition(rows.sentences[1]);

      expect(repository.savedProgress).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS - 1);
      expect(repository.savedProgress).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(repository.savedProgress).toHaveLength(1);
      expect(repository.savedProgress[0]?.sentenceId).toBe(rows.sentences[1].id);
    });

    it('collapses rapid position updates into a single write', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 1, sentencesPerParagraph: 3 }),
      );
      const reader = store();
      await reader.open(rows.reading.id);

      reader.reportPosition(rows.sentences[1]);
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS / 2);
      reader.reportPosition(rows.sentences[2]);
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);

      expect(repository.savedProgress).toHaveLength(1);
      expect(repository.savedProgress[0]?.sentenceId).toBe(rows.sentences[2].id);
    });

    it('ignores a report of the sentence already recorded as current', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 1, sentencesPerParagraph: 2 }),
      );
      const reader = store();
      await reader.open(rows.reading.id);

      reader.reportPosition(rows.sentences[0]);
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
      repository.savedProgress.length = 0;

      reader.reportPosition(rows.sentences[0]);

      expect(repository.savedProgress).toHaveLength(0);
    });

    it('flushProgress persists immediately and cancels the pending timer', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 1, sentencesPerParagraph: 2 }),
      );
      const reader = store();
      await reader.open(rows.reading.id);

      reader.reportPosition(rows.sentences[1]);
      await reader.flushProgress();

      expect(repository.savedProgress).toHaveLength(1);

      // Advancing past the original debounce must not write a second time.
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
      expect(repository.savedProgress).toHaveLength(1);
    });

    it('flushProgress is a no-op when nothing is pending', async () => {
      const rows = repository.add(buildReading({ id: 'r1' }));
      const reader = store();
      await reader.open(rows.reading.id);

      await reader.flushProgress();

      expect(repository.savedProgress).toHaveLength(0);
    });

    it('records a save failure without losing the read text', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 1, sentencesPerParagraph: 2 }),
      );
      repository.failSaveProgressWith = storageError('unavailable', 'Storage is unavailable.');
      const reader = store();
      await reader.open(rows.reading.id);

      reader.reportPosition(rows.sentences[1]);
      await reader.flushProgress();

      expect(reader.lastError()?.code).toBe('unavailable');
      expect(reader.status()).toBe('ready');
    });

    it('close flushes any pending write before releasing the reading', async () => {
      const rows = repository.add(
        buildReading({ id: 'r1', paragraphCount: 1, sentencesPerParagraph: 2 }),
      );
      const reader = store();
      await reader.open(rows.reading.id);

      reader.reportPosition(rows.sentences[1]);
      await reader.close();

      expect(repository.savedProgress).toHaveLength(1);
      expect(reader.status()).toBe('idle');
      expect(reader.paragraphs()).toHaveLength(0);
    });
  });

  describe('window extension', () => {
    it('extends forward and keeps the window within the mounted bound', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 20 }));
      const reader = store();
      await reader.open(rows.reading.id);

      const before = reader.window();
      await reader.extend('forward');

      const after = reader.window();
      expect(after.first).toBe(before.first);
      expect(after.count).toBeGreaterThan(before.count);
      expect(after.count).toBeLessThanOrEqual(15);
      expect(reader.paragraphs().length).toBe(after.count);
    });

    it('extends backward from a window anchored away from the start', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 20 }));
      const target = rows.sentences.find((sentence) => sentence.positionInReading === 10);
      if (target === undefined) {
        throw new Error('fixture is missing the expected sentence');
      }
      repository.progress.set(rows.reading.id, {
        readingId: rows.reading.id,
        paragraphId: target.paragraphId,
        sentenceId: target.id,
        positionInReading: target.positionInReading,
        lastOpenedAt: 1,
        updatedAt: 1,
      });
      const reader = store();
      await reader.open(rows.reading.id);

      const before = reader.window();
      await reader.extend('backward');

      const after = reader.window();
      expect(after.first).toBeLessThan(before.first);
    });

    it('does nothing when the window already reaches every paragraph', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 2 }));
      const reader = store();
      await reader.open(rows.reading.id);

      const before = reader.window();
      await reader.extend('forward');
      await reader.extend('backward');

      expect(reader.window()).toEqual(before);
    });

    it('ignores a concurrent extend request while one is already loading', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 20 }));
      const reader = store();
      await reader.open(rows.reading.id);

      const requestsBefore = repository.graphRequests.length;
      const first = reader.extend('forward');
      const second = reader.extend('forward');
      await Promise.all([first, second]);

      // Only one extension's worth of loading happened even though both calls
      // were in flight at once.
      expect(repository.graphRequests.length).toBe(requestsBefore + 1);
    });
  });
});
