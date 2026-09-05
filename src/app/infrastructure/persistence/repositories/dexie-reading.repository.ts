import Dexie from 'dexie';
import type { Clock } from '../../../domain/shared/clock';
import type { PreparationLayer } from '../../../domain/enrichment/preparation';
import { ok, type Result } from '../../../domain/shared/result';
import type { ReadingId, SentenceId } from '../../../domain/shared/ids';
import type {
  GeneratedStory,
  ImportedReading,
  LibraryFilter,
  Reading,
} from '../../../domain/reading/reading';
import type {
  GeneratedStoryDraft,
  ImportedReadingDraft,
  LibraryPage,
  LibraryPageRequest,
  ParagraphWindow,
  ReadingRepository,
  SentenceRef,
} from '../../../domain/reading/reading-repository';
import type { ReadingGraph, Sentence } from '../../../domain/reading/text-hierarchy';
import type { TokenAnalysis } from '../../../domain/reading/token';
import { storageError, type StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseBulkRecords, parseRecord, parseRecords } from '../record-validation';
import {
  paragraphRowSchema,
  readingRowSchema,
  sentenceRowSchema,
  tokenAnalysisRowSchema,
} from '../schemas/reading.schema';
import {
  toFrozenValidationRow,
  toGenerationProvenanceRow,
  toParagraph,
  toParagraphRow,
  toReading,
  toReadingRow,
  toSentence,
  toSentenceRow,
  toTokenAnalysis,
  toTokenAnalysisRow,
} from './reading-mappers';
import { StorageRuleViolation, runStorage, runStorageWithRules } from './storage-operation';
import {
  assertEnrichmentConsistent,
  assertNoSnapshotDependentValidation,
  assertProvenanceComplete,
  assertUniqueIds,
  assertUniquePositions,
} from './integrity';

/**
 * Reading persistence.
 *
 * Saving and deleting a reading are single transactions, so a reading is never
 * visible without its text and no owned child can outlive it.
 */
export class DexieReadingRepository implements ReadingRepository {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly clock: Clock,
  ) {}

  saveImportedReading(draft: ImportedReadingDraft): Promise<Result<ImportedReading, StorageError>> {
    return runStorageWithRules('readings.saveImported', async () => {
      this.assertTextIntegrity(draft);

      await this.db.transaction(
        'rw',
        [this.db.readings, this.db.paragraphs, this.db.sentences, this.db.tokenAnalyses],
        async () => {
          const existing = await this.db.readings.get(draft.reading.id);
          if (existing) {
            throw new StorageRuleViolation(
              storageError('conflict', 'This reading has already been saved.'),
            );
          }
          await this.db.readings.add(toReadingRow(draft.reading));
          await this.db.paragraphs.bulkAdd(draft.paragraphs.map(toParagraphRow));
          await this.db.sentences.bulkAdd(draft.sentences.map(toSentenceRow));
          await this.db.tokenAnalyses.bulkAdd(
            draft.tokenAnalyses.map((analysis) => toTokenAnalysisRow(analysis, draft.reading.id)),
          );
        },
      );

      return draft.reading;
    });
  }

  listImportedBySourceHash(
    sourceTextHash: string,
  ): Promise<Result<readonly ImportedReading[], StorageError>> {
    return this.loadImportedBySourceHash(sourceTextHash);
  }

  private async loadImportedBySourceHash(
    sourceTextHash: string,
  ): Promise<Result<readonly ImportedReading[], StorageError>> {
    const loaded = await runStorage('readings.listImportedBySourceHash', async () =>
      this.db.readings
        .filter(
          (candidate) =>
            candidate.kind === 'imported' && candidate.sourceTextHash === sourceTextHash,
        )
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(readingRowSchema, loaded.value, 'readings');
    return parsed.ok
      ? ok(
          parsed.value
            .map(toReading)
            .filter((reading): reading is ImportedReading => reading.kind === 'imported'),
        )
      : parsed;
  }

  /**
   * Writes an accepted story, its text, its frozen validation, and its
   * provenance in one transaction.
   *
   * Deliberately shaped exactly like `saveImportedReading`: same integrity
   * rules, same conflict on an id that already exists, same all-or-nothing
   * transaction. The two extra tables are what make a generated story
   * explainable, so they are written with it rather than after it — a story
   * that is visible without its validation would be a story nobody can check.
   *
   * No aid table is touched. Generation writes Japanese and the preparation
   * lane stores each aid on its own afterwards, so this transaction locks only
   * the tables a story is actually made of.
   */
  saveGeneratedStory(draft: GeneratedStoryDraft): Promise<Result<GeneratedStory, StorageError>> {
    return runStorageWithRules('readings.saveGenerated', async () => {
      this.assertTextIntegrity(draft);
      this.assertGeneratedIntegrity(draft);
      assertEnrichmentConsistent(draft);

      await this.db.transaction(
        'rw',
        [
          this.db.readings,
          this.db.paragraphs,
          this.db.sentences,
          this.db.tokenAnalyses,
          this.db.frozenValidations,
          this.db.generationProvenance,
        ],
        async () => {
          const existing = await this.db.readings.get(draft.reading.id);
          if (existing) {
            throw new StorageRuleViolation(
              storageError('conflict', 'This story has already been saved.'),
            );
          }
          await this.db.readings.add(toReadingRow(draft.reading));
          await this.db.paragraphs.bulkAdd(draft.paragraphs.map(toParagraphRow));
          await this.db.sentences.bulkAdd(draft.sentences.map(toSentenceRow));
          await this.db.tokenAnalyses.bulkAdd(
            draft.tokenAnalyses.map((analysis) => toTokenAnalysisRow(analysis, draft.reading.id)),
          );
          await this.db.frozenValidations.bulkAdd(
            draft.frozenValidations.map((validation) =>
              toFrozenValidationRow(validation, draft.reading.id),
            ),
          );
          await this.db.generationProvenance.add(toGenerationProvenanceRow(draft.provenance));
        },
      );

      return draft.reading;
    });
  }

  async getReading(id: ReadingId): Promise<Result<Reading | null, StorageError>> {
    const loaded = await runStorage('readings.get', () => this.db.readings.get(id));
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(readingRowSchema, loaded.value, 'readings');
    return parsed.ok ? ok(toReading(parsed.value)) : parsed;
  }

  async listLibraryPage(request: LibraryPageRequest): Promise<Result<LibraryPage, StorageError>> {
    const upperBound = request.createdBefore ?? Number.MAX_SAFE_INTEGER;
    const loaded = await runStorage('readings.listPage', () => {
      const collection =
        request.filter === 'all'
          ? this.db.readings.where('createdAt').below(upperBound)
          : this.db.readings
              .where('[kind+createdAt]')
              .between([request.filter, Dexie.minKey], [request.filter, upperBound], true, false);
      return collection
        .reverse()
        .limit(request.limit + 1)
        .toArray();
    });
    if (!loaded.ok) {
      return loaded;
    }

    const hasMore = loaded.value.length > request.limit;
    const parsed = parseRecords(readingRowSchema, loaded.value.slice(0, request.limit), 'readings');
    return parsed.ok ? ok({ items: parsed.value.map(toReading), hasMore }) : parsed;
  }

  countReadings(filter: LibraryFilter): Promise<Result<number, StorageError>> {
    return runStorage('readings.count', () =>
      filter === 'all'
        ? this.db.readings.count()
        : this.db.readings.where('kind').equals(filter).count(),
    );
  }

  async loadGraph(
    id: ReadingId,
    window?: ParagraphWindow,
  ): Promise<Result<ReadingGraph, StorageError>> {
    const loaded = await runStorage('readings.loadGraph', async () => {
      const paragraphs = window
        ? await this.db.paragraphs
            .where('[readingId+position]')
            .between(
              [id, window.firstParagraphPosition],
              [id, window.firstParagraphPosition + window.paragraphCount],
              true,
              false,
            )
            .toArray()
        : await this.db.paragraphs.where('readingId').equals(id).sortBy('position');

      const paragraphIds = new Set(paragraphs.map((paragraph) => paragraph.id));
      const sentences = await this.db.sentences
        .where('[readingId+positionInReading]')
        .between([id, Dexie.minKey], [id, Dexie.maxKey])
        .toArray();

      return {
        paragraphs,
        sentences: window
          ? sentences.filter((sentence) => paragraphIds.has(sentence.paragraphId))
          : sentences,
      };
    });
    if (!loaded.ok) {
      return loaded;
    }

    const paragraphs = parseRecords(paragraphRowSchema, loaded.value.paragraphs, 'paragraphs');
    if (!paragraphs.ok) {
      return paragraphs;
    }
    const sentences = parseRecords(sentenceRowSchema, loaded.value.sentences, 'sentences');
    if (!sentences.ok) {
      return sentences;
    }

    return ok({
      paragraphs: paragraphs.value.map(toParagraph),
      sentences: sentences.value.map(toSentence),
    });
  }

  countParagraphs(id: ReadingId): Promise<Result<number, StorageError>> {
    return runStorage('paragraphs.count', () =>
      this.db.paragraphs.where('readingId').equals(id).count(),
    );
  }

  async loadTokenAnalyses(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly TokenAnalysis[], StorageError>> {
    const loaded = await runStorage('tokenAnalyses.load', () =>
      this.db.tokenAnalyses
        .where('sentenceId')
        .anyOf([...sentenceIds])
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseBulkRecords(tokenAnalysisRowSchema, loaded.value, 'tokenAnalyses');
    return parsed.ok ? ok(parsed.value.map(toTokenAnalysis)) : parsed;
  }

  /** Primary-key lookups, ordered by position so batches follow the reading. */
  async loadSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly Sentence[], StorageError>> {
    const loaded = await runStorage('sentences.load', () =>
      this.db.sentences
        .where('id')
        .anyOf([...sentenceIds])
        .toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(sentenceRowSchema, loaded.value, 'sentences');
    if (!parsed.ok) {
      return parsed;
    }
    const sentences = parsed.value
      .map(toSentence)
      .sort((left, right) => left.positionInReading - right.positionInReading);
    return ok(sentences);
  }

  /** A single indexed scan; never loads sentence text. */
  async listSentenceRefs(
    readingId: ReadingId,
  ): Promise<Result<readonly SentenceRef[], StorageError>> {
    const loaded = await runStorage('sentences.listRefs', () =>
      this.db.sentences.where('readingId').equals(readingId).toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(sentenceRowSchema, loaded.value, 'sentences');
    return parsed.ok
      ? ok(
          parsed.value
            .map((row) => ({
              id: row.id,
              contentHash: row.contentHash,
              positionInReading: row.positionInReading,
            }))
            .sort((left, right) => left.positionInReading - right.positionInReading),
        )
      : parsed;
  }

  setPreparationTargets(
    id: ReadingId,
    targets: readonly PreparationLayer[],
  ): Promise<Result<Reading, StorageError>> {
    return runStorageWithRules('readings.setPreparationTargets', () =>
      this.db.transaction('rw', this.db.readings, async () => {
        const row = await this.db.readings.get(id);
        if (row === undefined) {
          throw new StorageRuleViolation(
            storageError('not-found', 'That reading no longer exists.'),
          );
        }
        const next = {
          ...row,
          preparationTargets: [...new Set(targets)],
          updatedAt: this.clock.now(),
        };
        const parsed = parseRecord(readingRowSchema, next, 'readings');
        if (!parsed.ok) throw new StorageRuleViolation(parsed.error);
        await this.db.readings.put(parsed.value);
        return toReading(parsed.value);
      }),
    );
  }

  renameReading(id: ReadingId, title: string): Promise<Result<Reading, StorageError>> {
    return runStorageWithRules('readings.rename', () =>
      this.db.transaction('rw', this.db.readings, async () => {
        const row = await this.db.readings.get(id);
        if (row === undefined) {
          throw new StorageRuleViolation(
            storageError('not-found', 'That reading no longer exists.'),
          );
        }
        const next = { ...row, title, updatedAt: this.clock.now() };
        const parsed = parseRecord(readingRowSchema, next, 'readings');
        if (!parsed.ok) throw new StorageRuleViolation(parsed.error);
        await this.db.readings.put(parsed.value);
        return toReading(parsed.value);
      }),
    );
  }

  deleteReading(id: ReadingId): Promise<Result<void, StorageError>> {
    return runStorage('readings.delete', async () => {
      await this.db.transaction(
        'rw',
        [
          this.db.readings,
          this.db.paragraphs,
          this.db.sentences,
          this.db.tokenAnalyses,
          this.db.frozenValidations,
          this.db.translations,
          this.db.grammarAnalyses,
          this.db.audioAssets,
          this.db.assetJobs,
          this.db.generationProvenance,
        ],
        async () => {
          await this.db.audioAssets.where('readingId').equals(id).delete();
          await this.db.translations.where('readingId').equals(id).delete();
          await this.db.grammarAnalyses.where('readingId').equals(id).delete();
          await this.db.frozenValidations.where('readingId').equals(id).delete();
          await this.db.tokenAnalyses.where('readingId').equals(id).delete();
          await this.db.sentences.where('readingId').equals(id).delete();
          await this.db.paragraphs.where('readingId').equals(id).delete();
          await this.db.assetJobs.where('readingId').equals(id).delete();
          await this.db.generationProvenance.where('readingId').equals(id).delete();
          await this.db.readings.delete(id);
        },
      );
    });
  }

  markOpened(id: ReadingId, openedAt: number): Promise<Result<void, StorageError>> {
    return runStorage('readings.markOpened', async () => {
      await this.db.readings.update(id, { lastOpenedAt: openedAt, updatedAt: this.clock.now() });
    });
  }

  /** Rules every reading obeys, whatever produced its text. */
  private assertTextIntegrity(draft: ImportedReadingDraft | GeneratedStoryDraft): void {
    assertUniqueIds(draft.paragraphs, 'paragraph');
    assertUniqueIds(draft.sentences, 'sentence');
    assertUniquePositions(
      draft.paragraphs.map((paragraph) => paragraph.position),
      'paragraph',
    );
    assertUniquePositions(
      draft.sentences.map((sentence) => sentence.positionInReading),
      'sentence',
    );

    const paragraphIds = new Set<string>(draft.paragraphs.map((paragraph) => paragraph.id));
    for (const sentence of draft.sentences) {
      if (!paragraphIds.has(sentence.paragraphId)) {
        throw new StorageRuleViolation(
          storageError('conflict', 'A sentence references a paragraph that is not being saved.'),
        );
      }
    }

    const sentenceIds = new Set<string>(draft.sentences.map((sentence) => sentence.id));
    for (const analysis of draft.tokenAnalyses) {
      if (!sentenceIds.has(analysis.sentenceId)) {
        throw new StorageRuleViolation(
          storageError(
            'conflict',
            'A token analysis references a sentence that is not being saved.',
          ),
        );
      }
    }

    if (draft.reading.sentenceCount !== draft.sentences.length) {
      throw new StorageRuleViolation(
        storageError('conflict', 'The reading sentence count does not match its sentences.'),
      );
    }
  }

  /** The rules only a generated story has to satisfy. */
  private assertGeneratedIntegrity(draft: GeneratedStoryDraft): void {
    assertNoSnapshotDependentValidation(draft.frozenValidations);
    assertProvenanceComplete(draft.provenance, draft.reading);

    const sentenceIds = new Set<string>(draft.sentences.map((sentence) => sentence.id));
    for (const validation of draft.frozenValidations) {
      if (!sentenceIds.has(validation.sentenceId)) {
        throw new StorageRuleViolation(
          storageError(
            'conflict',
            'A frozen validation references a sentence that is not being saved.',
          ),
        );
      }
    }
    if (draft.frozenValidations.length !== draft.sentences.length) {
      throw new StorageRuleViolation(
        storageError('conflict', 'Every sentence of a generated story needs a frozen validation.'),
      );
    }
  }
}
