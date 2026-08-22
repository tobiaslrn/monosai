import { Injectable, inject } from '@angular/core';
import type { ExtractedEntry } from '../../domain/anki/anki-provider';
import { canonicalizeExpression, expressionHashOf } from '../../domain/anki/canonical-expression';
import { mergeEntries, type PreparedEntry } from '../../domain/anki/deduplication';
import { extractVisibleText } from '../../domain/anki/field-extraction';
import { ANALYZER_VERSION, NORMALIZATION_VERSION } from '../../domain/language/analyzer-version';
import { languageError, type LanguageError } from '../../domain/language/language-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { snapshotId, vocabularyItemId, type SnapshotId } from '../../domain/shared/ids';
import type {
  AnkiProviderKind,
  SnapshotStats,
  VocabularyToken,
} from '../../domain/vocabulary/snapshot';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import type { SnapshotCommit } from '../../domain/vocabulary/vocabulary-repository';
import { MARKUP_TEXT_EXTRACTOR } from '../shared/anki-tokens';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { CLOCK, HASHER, ID_GENERATOR } from '../shared/repository-tokens';

/** Expressions sent to the language worker per call. */
const ANALYSIS_BATCH_SIZE = 200;

export interface AnalysisProgress {
  readonly completed: number;
  readonly total: number;
}

export interface BuildSnapshotRequest {
  readonly entries: readonly ExtractedEntry[];
  readonly mappings: readonly SourceMapping[];
  readonly providerKinds: readonly AnkiProviderKind[];
  readonly warnings: readonly string[];
  /** Reuse the current row identity so generated stories keep one snapshot link. */
  readonly snapshotId?: SnapshotId;
}

export interface BuiltSnapshot {
  readonly commit: SnapshotCommit;
  readonly stats: SnapshotStats;
}

interface AcceptedEntry {
  readonly entry: ExtractedEntry;
  readonly visibleExpression: string;
  readonly canonicalExpression: string;
  readonly expressionHash: string;
}

/**
 * Turns extracted field values into a snapshot ready to commit.
 *
 * This is where a provider's raw output becomes vocabulary: markup becomes
 * visible text, text becomes a canonical expression with a content hash,
 * expressions are tokenized so phrases can be matched later, and exact
 * duplicates merge while keeping every source that contributed them.
 *
 * Nothing here writes. The result is handed back so the refresh can show the
 * learner what it found before anything is stored.
 */
@Injectable({ providedIn: 'root' })
export class SnapshotBuilder {
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly extractor = inject(MARKUP_TEXT_EXTRACTOR);
  private readonly hasher = inject(HASHER);
  private readonly ids = inject(ID_GENERATOR);
  private readonly clock = inject(CLOCK);

  async build(
    request: BuildSnapshotRequest,
    onProgress?: (progress: AnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<Result<BuiltSnapshot, LanguageError>> {
    const mappingsById = new Map(request.mappings.map((mapping) => [mapping.id, mapping]));

    const accepted: AcceptedEntry[] = [];
    let rejectedEmptyValues = 0;

    for (const entry of request.entries) {
      const extracted = extractVisibleText(entry.rawFieldValue, this.extractor);
      if (!extracted.ok) {
        rejectedEmptyValues += 1;
        continue;
      }
      const canonicalExpression = canonicalizeExpression(extracted.value);
      accepted.push({
        entry,
        visibleExpression: extracted.value,
        canonicalExpression,
        expressionHash: expressionHashOf(this.hasher, canonicalExpression),
      });
    }

    // Only distinct expressions are tokenized. A 1,500-note deck with heavy
    // duplication would otherwise pay for the same analysis many times over.
    const distinct = new Map<string, string>();
    for (const item of accepted) {
      if (!distinct.has(item.expressionHash)) {
        distinct.set(item.expressionHash, item.visibleExpression);
      }
    }

    const analyzed = await this.analyze([...distinct], onProgress, signal);
    if (!analyzed.ok) {
      return analyzed;
    }

    const prepared: PreparedEntry[] = [];
    for (const item of accepted) {
      const mapping = mappingsById.get(item.entry.sourceMappingId);
      if (mapping === undefined) {
        continue;
      }
      prepared.push({
        sourceMappingId: mapping.id,
        deckName: mapping.deckName,
        noteTypeName: mapping.noteTypeName,
        fieldName: mapping.expressionFieldName,
        ...(item.entry.sourceNoteId === undefined ? {} : { sourceNoteId: item.entry.sourceNoteId }),
        visibleExpression: item.visibleExpression,
        canonicalExpression: item.canonicalExpression,
        expressionHash: item.expressionHash,
        analyzedSequence: analyzed.value.get(item.expressionHash) ?? [],
      });
    }

    const id = request.snapshotId ?? snapshotId(this.ids.nextId());
    const merged = mergeEntries(prepared, id, () => vocabularyItemId(this.ids.nextId()));

    const stats: SnapshotStats = {
      mappingsQueried: request.mappings.length,
      reviewedEligibleNotes: request.entries.length,
      nonEmptyValues: accepted.length,
      rejectedEmptyValues,
      duplicateOccurrences: merged.duplicateOccurrences,
      uniqueExpressions: merged.items.length,
      providerWarnings: [...request.warnings],
    };

    return ok({
      commit: {
        snapshot: {
          id,
          createdAt: this.clock.now(),
          status: 'complete',
          uniqueEntryCount: merged.items.length,
          mappingIds: request.mappings.map((mapping) => mapping.id),
          providerKinds: [...request.providerKinds],
          analyzerVersion: ANALYZER_VERSION,
          normalizationVersion: NORMALIZATION_VERSION,
          stats,
        },
        items: merged.items,
        provenance: merged.provenance,
      },
      stats,
    });
  }

  /**
   * Tokenizes each distinct expression as exactly one sentence.
   *
   * `analyze-sentences` is the right operation because an Anki field is already
   * a decided unit — it is whatever the learner put there — and must not be
   * re-segmented. Batching is the caller's decision, so progress and
   * cancellation stay answerable between batches.
   */
  private async analyze(
    distinct: readonly [string, string][],
    onProgress?: (progress: AnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<Result<ReadonlyMap<string, readonly VocabularyToken[]>, LanguageError>> {
    const sequences = new Map<string, readonly VocabularyToken[]>();
    const total = distinct.length;
    onProgress?.({ completed: 0, total });

    for (let start = 0; start < total; start += ANALYSIS_BATCH_SIZE) {
      const batch = distinct.slice(start, start + ANALYSIS_BATCH_SIZE);
      const analyzed = await this.runtime.analyzeSentences(
        batch.map(([, expression]) => expression),
        signal,
      );
      if (!analyzed.ok) {
        return analyzed;
      }
      // The worker answers positionally, so a length mismatch means the
      // sequences would be attached to the wrong expressions.
      if (analyzed.value.length !== batch.length) {
        return err(
          languageError(
            'invalid-response',
            'The language worker returned a different number of analyses than expressions.',
            `${String(batch.length)} sent, ${String(analyzed.value.length)} returned`,
          ),
        );
      }

      batch.forEach(([hash], index) => {
        const sentence = analyzed.value[index];
        sequences.set(
          hash,
          sentence.tokens.map((token) => ({
            surface: token.surface,
            ...(token.lemma === undefined ? {} : { lemma: token.lemma }),
            ...(token.readingHiragana === undefined
              ? {}
              : { readingHiragana: token.readingHiragana }),
          })),
        );
      });

      onProgress?.({ completed: Math.min(start + batch.length, total), total });
    }

    return ok(sequences);
  }
}
