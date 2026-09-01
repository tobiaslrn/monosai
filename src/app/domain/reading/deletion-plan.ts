import type { Reading } from './reading';
import { formatCountOf } from '../shared/locale';

/**
 * Every store a reading owns outright.
 *
 * Declaring the list once is what makes "zero orphan rows" checkable: the
 * cascade deletes exactly these, and the integrity test asserts exactly these
 * are empty afterwards, so adding an owned store without extending the cascade
 * fails a test rather than leaking rows.
 */
export const OWNED_READING_STORES = [
  'paragraphs',
  'sentences',
  'tokenAnalyses',
  'frozenValidations',
  'translations',
  'grammarAnalyses',
  'audioAssets',
  'assetJobs',
  'generationProvenance',
] as const;

export type OwnedReadingStore = (typeof OWNED_READING_STORES)[number];

/** Data a reading never owns, which deletion must leave alone. */
export const PRESERVED_ON_DELETE: readonly string[] = [
  'Your reviewed vocabulary',
  'Your grammar profile',
  'Your settings and saved key',
];

export interface DeletionPlan {
  readonly title: string;
  /** Plain-language list of what disappears, for the confirmation dialog. */
  readonly removes: readonly string[];
  readonly preserves: readonly string[];
  /** Deletion is permanent and there is no backup, so this is always true. */
  readonly isPermanent: true;
}

export interface ReadingJobActivity {
  readonly translationRunning: boolean;
  readonly audioRunning: boolean;
}

const NO_JOB_ACTIVITY: ReadingJobActivity = {
  translationRunning: false,
  audioRunning: false,
};

/**
 * Describes what deleting a reading removes.
 *
 * Only aids that actually exist are listed: promising to delete audio a reading
 * never had would misdescribe the action.
 */
export function describeDeletion(
  reading: Reading,
  activity: ReadingJobActivity = NO_JOB_ACTIVITY,
): DeletionPlan {
  const removes = [`The text and ${formatCountOf(reading.sentenceCount, 'sentence')}`];

  if (activity.translationRunning) {
    removes.push('The translation currently in progress');
  }
  if (activity.audioRunning) {
    removes.push('The audio generation currently in progress');
  }

  if (reading.translationSummary.completed > 0) {
    removes.push(formatCountOf(reading.translationSummary.completed, 'saved translation'));
  }
  if (reading.audioSummary.completed > 0) {
    removes.push(formatCountOf(reading.audioSummary.completed, 'saved audio clip'));
  }
  if (reading.grammarSummary.state !== 'not-requested') {
    removes.push('Saved grammar analyses');
  }

  return {
    title: reading.title,
    removes,
    preserves: PRESERVED_ON_DELETE,
    isPermanent: true,
  };
}
