import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLOCK, READING_REPOSITORY } from '../shared/repository-tokens';
import { fixedClock } from '../../domain/shared/clock';
import { readingId } from '../../domain/shared/ids';
import { ok, type Result } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { buildReading, FakeReadingRepository } from '../../../testing/reading-repository-fake';
import type { LanguageError } from '../../domain/language/language-error';
import { ReaderStore } from './reader.store';
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

  function store(): ReaderStore {
    return TestBed.inject(ReaderStore);
  }

  describe('opening', () => {
    it('starts at the first paragraph', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 20 }));
      const reader = store();

      await reader.open(rows.reading.id);

      expect(reader.status()).toBe('ready');
      expect(reader.window().first).toBe(0);
      expect(reader.hasMoreAbove()).toBe(false);
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

  describe('window extension', () => {
    it('moves directly to a bounded window around a virtual-scroll position', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 100 }));
      const reader = store();
      await reader.open(rows.reading.id);

      await reader.moveTo(80);

      expect(reader.window()).toEqual({ first: 77, count: 7 });
      expect(reader.paragraphs().map((paragraph) => paragraph.paragraph.position)).toEqual([
        77, 78, 79, 80, 81, 82, 83,
      ]);
      expect(reader.paragraphs().length).toBeLessThanOrEqual(15);
    });

    it('moves directly to the final paragraph for End semantics', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 100 }));
      const reader = store();
      await reader.open(rows.reading.id);

      await reader.moveTo(99);

      expect(reader.window()).toEqual({ first: 96, count: 4 });
      expect(reader.paragraphs().at(-1)?.paragraph.position).toBe(99);
    });

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

    it('extends backward after forward extension has trimmed the top', async () => {
      const rows = repository.add(buildReading({ id: 'r1', paragraphCount: 40 }));
      const reader = store();
      await reader.open(rows.reading.id);

      // Reading straight down moves the window rather than growing it, so the
      // top eventually leaves the mount and scrolling back up has to reload it.
      while (!reader.hasMoreAbove() && reader.hasMoreBelow()) {
        await reader.extend('forward');
      }
      expect(reader.hasMoreAbove()).toBe(true);

      const before = reader.window();
      await reader.extend('backward');

      expect(reader.window().first).toBeLessThan(before.first);
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

  describe('preparation targets', () => {
    it('stores what the open reading should contain and shows the saved row', async () => {
      const rows = repository.add(buildReading({ id: 'r1' }));
      const reader = store();
      await reader.open(rows.reading.id);

      await reader.setPreparationTargets(['english', 'grammar']);

      expect(reader.reading()?.preparationTargets).toEqual(['english', 'grammar']);
      const stored = await repository.getReading(rows.reading.id);
      expect(stored.ok && stored.value?.preparationTargets).toEqual(['english', 'grammar']);
    });

    it('does nothing at all with no reading open', async () => {
      const reader = store();

      await reader.setPreparationTargets(['english']);

      expect(reader.reading()).toBeNull();
      expect(reader.lastError()).toBeNull();
    });
  });
});
