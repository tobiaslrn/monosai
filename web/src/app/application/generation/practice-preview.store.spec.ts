import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { snapshotId, vocabularyItemId } from '../../domain/shared/ids';
import type { RandomSource } from '../../domain/shared/random';
import { ok, err, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import type { PracticeEvidence } from '../../domain/anki/practice-evidence';
import type { VocabularyExpression, VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import type {
  CapturedSourceObservation,
  VocabularyCapture,
} from '../../domain/vocabulary/vocabulary-repository';
import { vocabularySourceId } from '../../domain/shared/ids';
import { RANDOM_SOURCE, VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import { PracticePreviewStore } from './practice-preview.store';

const SOURCE_ID = vocabularySourceId('22222222-2222-4222-8222-222222222222');

function snapshotWith(revision: string): VocabularySnapshot {
  return {
    id: snapshotId('11111111-1111-4111-8111-111111111111'),
    revision,
    createdAt: 1_700_000_000_000,
    status: 'complete',
    uniqueEntryCount: 0,
    sourceIds: [SOURCE_ID],
    sourceKinds: ['anki-connect'],
    analyzerVersion: '1',
    normalizationVersion: '1',
    stats: {
      sourcesQueried: 1,
      entriesRead: 0,
      nonEmptyValues: 0,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: 0,
      sourceWarnings: [],
    },
  };
}

function expression(word: string, practice: PracticeEvidence = {}): VocabularyExpression {
  return {
    canonicalExpression: word,
    visibleExpression: word,
    expressionHash: `hash-${word}`,
    itemIds: [vocabularyItemId(`item-${word}`)],
    meanings: [],
    practice,
  };
}

function observation(
  overrides: Partial<CapturedSourceObservation> = {},
): CapturedSourceObservation {
  return {
    sourceId: SOURCE_ID,
    label: 'Anki · Core Japanese · Expression',
    kind: 'anki-connect',
    providerKind: 'android-connect',
    automaticSync: true,
    refreshedAt: 1_700_000_000_000,
    practice: {
      recentAnswers: 'available',
      recentDifficulty: 'available',
      learningState: 'available',
      fsrsDifficulty: 'available',
      windowBasis: 'anki-study-days',
      observedAt: 1_700_000_000_000,
    },
    warnings: [],
    ...overrides,
  };
}

/** A repository whose capture the test decides, one answer at a time. */
class StubCaptureRepository {
  private queue: Result<VocabularyCapture | null, StorageError>[] = [];
  captures = 0;

  answerWith(...results: Result<VocabularyCapture | null, StorageError>[]): void {
    this.queue = [...results];
  }

  captureVocabulary(): Promise<Result<VocabularyCapture | null, StorageError>> {
    this.captures += 1;
    return Promise.resolve(
      this.queue.length > 1 ? this.queue.shift()! : (this.queue[0] ?? ok(null)),
    );
  }
}

function captureOf(
  expressions: readonly VocabularyExpression[],
  revision = 'revision-1',
  sources: readonly CapturedSourceObservation[] = [observation()],
): VocabularyCapture {
  return { snapshot: snapshotWith(revision), expressions, sources };
}

const RECENT_POOL = [
  expression('あ', { answeredWithinDays: 1 }),
  expression('い', { answeredWithinDays: 1 }),
  expression('う', { answeredWithinDays: 1 }),
  expression('え', { answeredWithinDays: 1 }),
  expression('お', { answeredWithinDays: 1 }),
  expression('か', { answeredWithinDays: 1 }),
  expression('き', { answeredWithinDays: 1 }),
];

describe('PracticePreviewStore', () => {
  let repository: StubCaptureRepository;
  let store: PracticePreviewStore;
  let draw = 0;

  beforeEach(() => {
    repository = new StubCaptureRepository();
    draw = 0;
    // Walks the pool between calls, so a second draw over the same candidates
    // is genuinely a different draw rather than the same one repeated.
    const random: RandomSource = {
      nextInt: (exclusiveMax) => {
        draw += 1;
        return exclusiveMax <= 1 ? 0 : draw % exclusiveMax;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: VOCABULARY_REPOSITORY, useValue: repository },
        { provide: RANDOM_SOURCE, useValue: random },
      ],
    });
    store = TestBed.inject(PracticePreviewStore);
  });

  it('claims nothing about practice before it has read anything', () => {
    expect(store.state()).toEqual({ kind: 'idle' });
    expect(store.targets()).toEqual([]);
    expect(store.submit()).toBeNull();
  });

  it('says there is nothing to practise from before a vocabulary exists', async () => {
    repository.answerWith(ok(null));

    await store.refresh();

    expect(store.state()).toEqual({ kind: 'empty' });
    expect(store.submit()).toBeNull();
  });

  it('shows the words its one capture chose, and the revision they came from', async () => {
    repository.answerWith(ok(captureOf(RECENT_POOL)));

    await store.refresh();

    expect(store.state().kind).toBe('ready');
    expect(store.targets()).toHaveLength(6);
    expect(store.revision()).toBe('revision-1');
  });

  describe('stability', () => {
    beforeEach(async () => {
      repository.answerWith(ok(captureOf(RECENT_POOL)));
      await store.refresh();
    });

    it('does not redraw the list just because something read it', () => {
      const first = store.targets();

      expect(store.targets()).toBe(first);
      expect(store.selection()?.targets).toBe(first);
    });

    it('does not redraw when a story length keeps the same number of words', () => {
      store.setSentenceCount(15);
      const before = store.targets();

      store.setSentenceCount(20);

      expect(store.targets()).toBe(before);
    });

    it('redraws when the requested length changes how many words are asked for', () => {
      store.setSentenceCount(5);

      expect(store.targets()).toHaveLength(3);
    });

    it('hands a generation exactly the list that was on screen', () => {
      const shown = store.targets();

      const commitment = store.submit();

      expect(commitment?.selection.targets).toBe(shown);
      expect(commitment?.revision).toBe('revision-1');
      expect(commitment?.allowedVocabulary).toEqual(
        RECENT_POOL.map((entry) => entry.canonicalExpression),
      );
    });

    it('leaves a submitted list untouched when the vocabulary later changes', async () => {
      const commitment = store.submit();
      repository.answerWith(ok(captureOf([expression('新', { answeredWithinDays: 1 })], 'r2')));

      await store.refresh();

      expect(commitment?.selection.targets).not.toEqual(store.targets());
      expect(commitment?.revision).toBe('revision-1');
      expect(store.revision()).toBe('r2');
    });

    it('draws again only when asked to shuffle', () => {
      const before = store.targets().map((target) => target.canonicalExpression);

      store.shuffle();

      expect(store.targets().map((target) => target.canonicalExpression)).not.toEqual(before);
    });
  });

  describe('the learner editing the list', () => {
    beforeEach(async () => {
      repository.answerWith(ok(captureOf(RECENT_POOL)));
      await store.refresh();
    });

    it('keeps a picked word whatever the automatic draw would have done', () => {
      store.pin('き');

      expect(store.targets()[0]).toMatchObject({
        canonicalExpression: 'き',
        origin: 'manual',
        reasons: ['chosen'],
      });
    });

    it('keeps picked words through a shuffle', () => {
      store.pin('き');

      store.shuffle();

      expect(store.targets().some((target) => target.canonicalExpression === 'き')).toBe(true);
    });

    it('keeps picked words through a refresh that changed nothing else', async () => {
      store.pin('き');
      repository.answerWith(ok(captureOf(RECENT_POOL, 'revision-2')));

      await store.refresh();

      expect(store.targets().some((target) => target.canonicalExpression === 'き')).toBe(true);
    });

    it('reports a picked word the vocabulary no longer has instead of sending it', async () => {
      store.pin('き');
      repository.answerWith(
        ok(
          captureOf(
            RECENT_POOL.filter((entry) => entry.canonicalExpression !== 'き'),
            'r2',
          ),
        ),
      );

      await store.refresh();

      expect(store.selection()?.unavailablePins).toEqual(['き']);
      expect(store.targets().some((target) => target.canonicalExpression === 'き')).toBe(false);
    });

    it('takes the slot away with a removed word rather than refilling it', () => {
      const removed = store.targets()[0].canonicalExpression;

      store.remove(removed);

      expect(store.targets()).toHaveLength(5);
      expect(store.targets().some((target) => target.canonicalExpression === removed)).toBe(false);
    });

    it('keeps a removal through a shuffle, or it would not be a removal', () => {
      const removed = store.targets()[0].canonicalExpression;
      store.remove(removed);

      store.shuffle();

      expect(store.targets().some((target) => target.canonicalExpression === removed)).toBe(false);
    });

    it('names picked words that no longer fit after a story is shortened', () => {
      store.pin('あ');
      store.pin('い');
      store.pin('う');
      store.pin('え');

      store.setSentenceCount(5);

      expect(store.selection()?.excessPins).toEqual(['え']);
      expect(store.targets()).toHaveLength(3);
    });
  });

  describe('what the sources could prove', () => {
    it('reads a source that ran the searches as measured', async () => {
      repository.answerWith(ok(captureOf(RECENT_POOL)));

      await store.refresh();

      expect(store.sources()[0].standing).toBe('measured');
      expect(store.hasMeasuredPractice()).toBe(true);
    });

    it('tells a bridge that cannot ask from one that has not been read', async () => {
      repository.answerWith(
        ok(
          captureOf(RECENT_POOL, 'revision-1', [
            observation({ practice: null, refreshedAt: null }),
            observation({
              sourceId: vocabularySourceId('33333333-3333-4333-8333-333333333333'),
              practice: {
                recentAnswers: 'unsupported',
                recentDifficulty: 'unsupported',
                learningState: 'unsupported',
                fsrsDifficulty: 'unsupported',
                windowBasis: 'anki-study-days',
                observedAt: 1_700_000_000_000,
              },
            }),
          ]),
        ),
      );

      await store.refresh();

      expect(store.sources().map((source) => source.standing)).toEqual(['unread', 'unsupported']);
      // Neither of these says the learner did not study, so neither may be
      // presented as an answered "no".
      expect(store.hasMeasuredPractice()).toBe(false);
    });
  });

  describe('when a read fails', () => {
    it('says so plainly before any list exists', async () => {
      repository.answerWith(err(storageError('unavailable', 'The database could not be opened.')));

      await store.refresh();

      expect(store.state()).toEqual({
        kind: 'failed',
        message: 'The database could not be opened.',
        keptPreviousSelection: false,
      });
    });

    it('keeps the words already shown, and says it kept them', async () => {
      repository.answerWith(ok(captureOf(RECENT_POOL)));
      await store.refresh();
      const before = store.targets();
      repository.answerWith(err(storageError('unavailable', 'Anki could not be reached.')));

      await store.refresh();

      expect(store.targets()).toBe(before);
      expect(store.state()).toMatchObject({ kind: 'failed', keptPreviousSelection: true });
      expect(store.submit()?.selection.targets).toBe(before);
    });
  });

  it('coalesces overlapping refreshes into one read', async () => {
    repository.answerWith(ok(captureOf(RECENT_POOL)));

    await Promise.all([store.refresh(), store.refresh(), store.refresh()]);

    expect(repository.captures).toBe(1);
  });
});
