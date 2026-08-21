import type { ReadingId, SnapshotId } from '../shared/ids';
import type { CompletionSummary, GrammarSummary } from './summaries';

export type ReadingKind = 'imported' | 'generated';
export type ImportSource = 'paste' | 'text-file';
export type StoryForm = 'micro' | 'short';

interface ReadingBase {
  readonly id: ReadingId;
  readonly kind: ReadingKind;
  readonly title: string;
  readonly createdAt: number;
  /** Metadata and aid summaries only; source text is immutable. */
  readonly updatedAt: number;
  readonly sentenceCount: number;
  /** Denormalized for library cards and Continue reading; null until opened. */
  readonly lastOpenedAt: number | null;
  readonly characterCount: number;
  /**
   * The opening of the text, denormalized so a shelf of library cards can show
   * Japanese without loading any reading's sentences.
   */
  readonly excerpt: string;
  readonly translationSummary: CompletionSummary;
  readonly grammarSummary: GrammarSummary;
  readonly audioSummary: CompletionSummary;
  readonly analyzerVersion: string;
}

export interface ImportedReading extends ReadingBase {
  readonly kind: 'imported';
  readonly importSource: ImportSource;
  readonly sourceFileName?: string;
  readonly sourceTextHash: string;
}

/** Validation outcome frozen on an accepted generated story. */
export type GeneratedValidationOutcome =
  { readonly kind: 'strict' } | { readonly kind: 'exception'; readonly exceptionCount: number };

export interface GeneratedStory extends ReadingBase {
  readonly kind: 'generated';
  readonly form: StoryForm;
  readonly premise: string;
  readonly specialInstructions?: string;
  readonly snapshotId: SnapshotId;
  readonly generationProvenanceId: string;
  readonly validationOutcome: GeneratedValidationOutcome;
}

export type Reading = ImportedReading | GeneratedStory;

export const READING_KINDS: readonly ReadingKind[] = ['imported', 'generated'];

export type LibraryFilter = 'all' | ReadingKind;

export function matchesFilter(reading: Reading, filter: LibraryFilter): boolean {
  return filter === 'all' || reading.kind === filter;
}
