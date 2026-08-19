import type { ContinueReadingTarget, ReadingProgress } from '../app/domain/reading/progress';
import type {
  GeneratedStory,
  ImportedReading,
  LibraryFilter,
  Reading,
} from '../app/domain/reading/reading';
import type { SentenceLocation } from '../app/domain/reading/reading-position';
import type { GenerationProvenance } from '../app/domain/ai/generation-provenance';
import type { FrozenSentenceValidation } from '../app/domain/reading/validation';
import type {
  GeneratedStoryDraft,
  ImportedReadingDraft,
  LibraryPage,
  LibraryPageRequest,
  ParagraphWindow,
  ReadingRepository,
} from '../app/domain/reading/reading-repository';
import type { Paragraph, ReadingGraph, Sentence } from '../app/domain/reading/text-hierarchy';
import type { Token, TokenAnalysis } from '../app/domain/reading/token';
import {
  paragraphId,
  readingId,
  sentenceId,
  snapshotId,
  type ParagraphId,
  type ReadingId,
  type SentenceId,
} from '../app/domain/shared/ids';
import { err, ok, type Result } from '../app/domain/shared/result';
import type { StorageError } from '../app/domain/storage/storage-error';

/** One synthetic reading's rows, shaped exactly as the repository stores them. */
export interface FakeReadingRows {
  readonly reading: Reading;
  readonly paragraphs: readonly Paragraph[];
  readonly sentences: readonly Sentence[];
  readonly tokenAnalyses: readonly TokenAnalysis[];
}

export interface BuildReadingOptions {
  readonly id?: string;
  readonly title?: string;
  readonly kind?: 'imported' | 'generated';
  readonly paragraphCount?: number;
  readonly sentencesPerParagraph?: number;
  readonly createdAt?: number;
  /** Sentence text, given its paragraph and in-paragraph positions. */
  readonly sentenceText?: (paragraph: number, sentence: number) => string;
}

/**
 * Builds a reading with a predictable shape.
 *
 * The Japanese is a numbered placeholder: what a store test asserts on is ids,
 * positions, and paragraph membership being consistent with what the Dexie
 * adapter produces, not morphology, which the golden corpus covers.
 */
export function buildReading(options: BuildReadingOptions = {}): FakeReadingRows {
  const key = options.id ?? 'r1';
  const id = readingId(key);
  const paragraphCount = options.paragraphCount ?? 1;
  const perParagraph = options.sentencesPerParagraph ?? 1;
  const createdAt = options.createdAt ?? 1_700_000_000_000;
  const text =
    options.sentenceText ??
    ((paragraph, sentence) => `第${String(paragraph)}段落の第${String(sentence)}文です。`);

  const paragraphs: Paragraph[] = [];
  const sentences: Sentence[] = [];
  const tokenAnalyses: TokenAnalysis[] = [];
  let positionInReading = 0;

  for (let position = 0; position < paragraphCount; position += 1) {
    const owner = paragraphId(`${key}-p${String(position)}`);
    const texts: string[] = [];
    for (let index = 0; index < perParagraph; index += 1) {
      const japaneseText = text(position, index);
      texts.push(japaneseText);
      const owned = sentenceId(`${key}-p${String(position)}-s${String(index)}`);
      sentences.push({
        id: owned,
        readingId: id,
        paragraphId: owner,
        positionInReading,
        positionInParagraph: index,
        japaneseText,
        contentHash: `hash-${String(positionInReading)}`,
      });
      tokenAnalyses.push({
        sentenceId: owned,
        analyzerVersion: 'fake',
        tokens: singleToken(japaneseText),
      });
      positionInReading += 1;
    }
    paragraphs.push({ id: owner, readingId: id, position, sourceText: texts.join('') });
  }

  const base = {
    id,
    title: options.title ?? 'Reading',
    createdAt,
    updatedAt: createdAt,
    sentenceCount: sentences.length,
    lastOpenedAt: null,
    characterCount: sentences.reduce((total, sentence) => total + sentence.japaneseText.length, 0),
    translationSummary: { total: sentences.length, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' as const },
    audioSummary: { total: sentences.length, completed: 0, failed: 0 },
    analyzerVersion: 'fake',
  };

  const reading: Reading =
    (options.kind ?? 'imported') === 'imported'
      ? { ...base, kind: 'imported', importSource: 'paste', sourceTextHash: 'hash' }
      : {
          ...base,
          kind: 'generated',
          form: 'micro',
          premise: 'premise',
          snapshotId: snapshotId('snap'),
          generationProvenanceId: 'gen',
          validationOutcome: { kind: 'strict' },
        };

  return { reading, paragraphs, sentences, tokenAnalyses };
}

function singleToken(text: string): readonly Token[] {
  return [
    {
      id: `${text}-t0`,
      startUtf16: 0,
      endUtf16: text.length,
      surface: text,
      dictionaryKeys: [text],
      isPunctuation: false,
    },
  ];
}

/**
 * In-memory `ReadingRepository`.
 *
 * It honours the paragraph window and the bounded lookups exactly, so a test can
 * assert that a caller asked for a bounded slice rather than the whole reading.
 * Every read is recorded for that purpose.
 */
export class FakeReadingRepository implements ReadingRepository {
  readings: Reading[] = [];
  paragraphs: Paragraph[] = [];
  sentences: Sentence[] = [];
  tokenAnalyses: TokenAnalysis[] = [];
  readonly progress = new Map<ReadingId, ReadingProgress>();
  continueTarget: ContinueReadingTarget | null = null;

  readonly deleted: ReadingId[] = [];
  readonly opened: { readonly id: ReadingId; readonly at: number }[] = [];
  readonly graphRequests: (ParagraphWindow | undefined)[] = [];
  readonly analysisRequests: (readonly SentenceId[])[] = [];
  readonly savedProgress: ReadingProgress[] = [];
  frozenValidations: FrozenSentenceValidation[] = [];
  provenance: GenerationProvenance[] = [];
  /** Set to make an accepted story fail to save, without losing the candidate. */
  failSaveGeneratedWith: StorageError | null = null;

  /** Set to make the matching read or write fail with a typed storage error. */
  failListWith: StorageError | null = null;
  failGraphWith: StorageError | null = null;
  failProgressWith: StorageError | null = null;
  failSaveProgressWith: StorageError | null = null;

  /** Adds one built reading and every row it owns. */
  add(rows: FakeReadingRows): FakeReadingRows {
    this.readings.push(rows.reading);
    this.paragraphs.push(...rows.paragraphs);
    this.sentences.push(...rows.sentences);
    this.tokenAnalyses.push(...rows.tokenAnalyses);
    return rows;
  }

  saveImportedReading(draft: ImportedReadingDraft): Promise<Result<ImportedReading, StorageError>> {
    this.readings.push(draft.reading);
    this.paragraphs.push(...draft.paragraphs);
    this.sentences.push(...draft.sentences);
    this.tokenAnalyses.push(...draft.tokenAnalyses);
    return Promise.resolve(ok(draft.reading));
  }

  saveGeneratedStory(draft: GeneratedStoryDraft): Promise<Result<GeneratedStory, StorageError>> {
    if (this.failSaveGeneratedWith !== null) {
      // Exactly like the real transaction aborting: not one row is written.
      return Promise.resolve(err(this.failSaveGeneratedWith));
    }
    this.readings.push(draft.reading);
    this.paragraphs.push(...draft.paragraphs);
    this.sentences.push(...draft.sentences);
    this.tokenAnalyses.push(...draft.tokenAnalyses);
    this.frozenValidations.push(...draft.frozenValidations);
    this.provenance.push(draft.provenance);
    return Promise.resolve(ok(draft.reading));
  }

  getReading(id: ReadingId): Promise<Result<Reading | null, StorageError>> {
    return Promise.resolve(ok(this.readings.find((reading) => reading.id === id) ?? null));
  }

  listLibraryPage(request: LibraryPageRequest): Promise<Result<LibraryPage, StorageError>> {
    if (this.failListWith !== null) {
      return Promise.resolve(err(this.failListWith));
    }
    const matching = this.readings
      .filter((item) => request.filter === 'all' || item.kind === request.filter)
      .filter(
        (item) => request.createdBefore === undefined || item.createdAt < request.createdBefore,
      )
      .sort((left, right) => right.createdAt - left.createdAt);
    return Promise.resolve(
      ok({ items: matching.slice(0, request.limit), hasMore: matching.length > request.limit }),
    );
  }

  countReadings(filter: LibraryFilter): Promise<Result<number, StorageError>> {
    return Promise.resolve(
      ok(
        filter === 'all'
          ? this.readings.length
          : this.readings.filter((reading) => reading.kind === filter).length,
      ),
    );
  }

  loadGraph(id: ReadingId, window?: ParagraphWindow): Promise<Result<ReadingGraph, StorageError>> {
    this.graphRequests.push(window);
    if (this.failGraphWith !== null) {
      return Promise.resolve(err(this.failGraphWith));
    }
    const all = this.paragraphsOf(id);
    const paragraphs =
      window === undefined
        ? all
        : all.slice(
            window.firstParagraphPosition,
            window.firstParagraphPosition + window.paragraphCount,
          );
    const included = new Set<ParagraphId>(paragraphs.map((paragraph) => paragraph.id));
    return Promise.resolve(
      ok({
        paragraphs,
        sentences: this.sentences.filter((sentence) => included.has(sentence.paragraphId)),
      }),
    );
  }

  countParagraphs(id: ReadingId): Promise<Result<number, StorageError>> {
    return Promise.resolve(ok(this.paragraphsOf(id).length));
  }

  locateSentence(
    id: ReadingId,
    positionInReading: number,
  ): Promise<Result<SentenceLocation | null, StorageError>> {
    const sentence = this.sentences.find(
      (candidate) =>
        candidate.readingId === id && candidate.positionInReading === positionInReading,
    );
    if (sentence === undefined) {
      return Promise.resolve(ok(null));
    }
    const paragraph = this.paragraphs.find((candidate) => candidate.id === sentence.paragraphId);
    return Promise.resolve(
      ok({
        sentenceId: sentence.id,
        paragraphId: sentence.paragraphId,
        paragraphPosition: paragraph?.position ?? 0,
        positionInReading: sentence.positionInReading,
      }),
    );
  }

  loadTokenAnalyses(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly TokenAnalysis[], StorageError>> {
    this.analysisRequests.push(sentenceIds);
    const wanted = new Set(sentenceIds);
    return Promise.resolve(
      ok(this.tokenAnalyses.filter((analysis) => wanted.has(analysis.sentenceId))),
    );
  }

  deleteReading(id: ReadingId): Promise<Result<void, StorageError>> {
    this.deleted.push(id);
    const orphaned = new Set<SentenceId>(
      this.sentences.filter((sentence) => sentence.readingId === id).map((sentence) => sentence.id),
    );
    this.readings = this.readings.filter((reading) => reading.id !== id);
    this.paragraphs = this.paragraphs.filter((paragraph) => paragraph.readingId !== id);
    this.sentences = this.sentences.filter((sentence) => sentence.readingId !== id);
    this.tokenAnalyses = this.tokenAnalyses.filter(
      (analysis) => !orphaned.has(analysis.sentenceId),
    );
    this.progress.delete(id);
    if (this.continueTarget?.readingId === id) {
      this.continueTarget = null;
    }
    return Promise.resolve(ok(undefined));
  }

  saveProgress(progress: ReadingProgress): Promise<Result<void, StorageError>> {
    if (this.failSaveProgressWith !== null) {
      return Promise.resolve(err(this.failSaveProgressWith));
    }
    this.savedProgress.push(progress);
    this.progress.set(progress.readingId, progress);
    return Promise.resolve(ok(undefined));
  }

  getProgress(id: ReadingId): Promise<Result<ReadingProgress | null, StorageError>> {
    if (this.failProgressWith !== null) {
      return Promise.resolve(err(this.failProgressWith));
    }
    return Promise.resolve(ok(this.progress.get(id) ?? null));
  }

  resolveContinueReading(): Promise<Result<ContinueReadingTarget | null, StorageError>> {
    return Promise.resolve(ok(this.continueTarget));
  }

  markOpened(id: ReadingId, openedAt: number): Promise<Result<void, StorageError>> {
    this.opened.push({ id, at: openedAt });
    return Promise.resolve(ok(undefined));
  }

  private paragraphsOf(id: ReadingId): Paragraph[] {
    return this.paragraphs
      .filter((paragraph) => paragraph.readingId === id)
      .sort((left, right) => left.position - right.position);
  }
}
