import type { Result } from '../shared/result';
import type { AnkiFieldSample } from '../vocabulary/suggest-anki-mapping';
import type { SourceMappingId } from '../shared/ids';
import type { AnkiProviderKind } from '../vocabulary/snapshot';
import type { SourceMapping } from '../vocabulary/source-mapping';
import type { AnkiCapabilities } from './capabilities';
import type { AnkiCatalog } from './catalog';
import type { AnkiError } from './anki-error';
import type { AnkiSchedulingSignals } from './scheduling-signals';
import type { PracticeEvidence, PracticeObservationBasis } from './practice-evidence';

/**
 * One reviewed field value, exactly as the provider read it.
 *
 * The raw markup is carried across the boundary unchanged; turning it into
 * visible text is the domain's job, so every provider produces the same result
 * from the same field and no adapter can quietly apply its own cleanup.
 */
export interface ExtractedEntry {
  readonly sourceMappingId: SourceMappingId;
  /** Absent when the note has no value for the selected field at all. */
  readonly rawFieldValue?: string;
  /** Absent when no meaning field is mapped or the note has no value there. */
  readonly rawMeaning?: string;
  /** Diagnostic only. Providers that cannot expose note ids safely omit it. */
  readonly sourceNoteId?: string;
  /** Optional normalized scheduling state from eligible cards for this note. */
  readonly reps?: AnkiSchedulingSignals['reps'];
  readonly lapseRatio?: AnkiSchedulingSignals['lapseRatio'];
  readonly easeFactor?: AnkiSchedulingSignals['easeFactor'];
  readonly firstReviewedAt?: AnkiSchedulingSignals['firstReviewedAt'];
  readonly firstReviewedPrecision?: AnkiSchedulingSignals['firstReviewedPrecision'];
  readonly intervalDays?: AnkiSchedulingSignals['intervalDays'];
  readonly fsrsDifficulty?: AnkiSchedulingSignals['fsrsDifficulty'];
  readonly lastReviewedAt?: AnkiSchedulingSignals['lastReviewedAt'];
  /**
   * What the source observed about recent study of this note.
   *
   * Meaningful only under the capture's basis, which arrives once per mapping
   * as an `observed` event rather than being repeated on every entry.
   */
  readonly practice?: PracticeEvidence;
}

/**
 * Streamed extraction progress.
 *
 * `examined` counts what the provider looked at, `total` is `null` when the
 * provider cannot report a reliable count — the summary then omits the number
 * instead of showing a guess.
 */
export type AnkiExtractionEvent =
  | {
      readonly kind: 'progress';
      readonly mappingId: SourceMappingId;
      readonly examined: number;
      readonly total: number | null;
    }
  | { readonly kind: 'entry'; readonly entry: ExtractedEntry }
  | {
      /**
       * What this mapping's read could establish, emitted once it is settled.
       *
       * Kept apart from the entries because it describes the capture, not a
       * word: it is what separates a word nobody studied from a word about
       * which nothing could be asked.
       */
      readonly kind: 'observed';
      readonly mappingId: SourceMappingId;
      readonly basis: PracticeObservationBasis;
    }
  | { readonly kind: 'warning'; readonly message: string }
  | { readonly kind: 'failed'; readonly error: AnkiError };

/**
 * A package file the learner chose.
 *
 * The bytes are read lazily so a file of hundreds of megabytes is not held
 * twice while it waits to be opened.
 */
export interface PackageSource {
  readonly fileName: string;
  bytes(): Promise<ArrayBuffer>;
}

/**
 * Read-only access to one Anki source.
 *
 * There is deliberately no generic action method: every implementation exposes
 * exactly these three operations, so no caller can reach a write action through
 * the port even by accident.
 */
export interface AnkiVocabularyProvider {
  readonly kind: AnkiProviderKind;
  probe(signal?: AbortSignal): Promise<Result<AnkiCapabilities, AnkiError>>;
  discover(signal?: AbortSignal): Promise<Result<AnkiCatalog, AnkiError>>;
  /** Optional, bounded read used only to suggest a mapping before confirmation. */
  sampleFields?(
    catalog: AnkiCatalog,
    signal?: AbortSignal,
  ): Promise<Result<readonly AnkiFieldSample[], AnkiError>>;
  extractReviewed(
    mappings: readonly SourceMapping[],
    signal?: AbortSignal,
  ): AsyncIterable<AnkiExtractionEvent>;
  /** Releases provider resources. Safe to call more than once. */
  dispose(): void;
}
