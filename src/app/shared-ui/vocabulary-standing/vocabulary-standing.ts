import { formatCountOf, formatRelativeDay } from '../../domain/shared/locale';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import type { VocabularySourceKind } from '../../domain/vocabulary/vocabulary-source';

/**
 * How the learner's standing is said, wherever it is said.
 *
 * The Library states it in one line and the reading-level page states it as a
 * fact above its own controls. Two screens describing the same snapshot is how
 * they start to disagree, so both read these functions and neither formats a
 * count or a day itself.
 */

/** Names the source in the learner's terms rather than by its provider. */
const SOURCE_LABELS: Readonly<Record<VocabularySourceKind, string>> = {
  'anki-connect': 'Anki',
  'anki-package': 'Anki package',
  'text-list': 'Pasted list',
};

/** `Anki`, or `Anki + Pasted list` where a snapshot was built from both. */
export function vocabularySourceSummary(kinds: readonly VocabularySourceKind[]): string {
  const labels = [...new Set(kinds.map((kind) => SOURCE_LABELS[kind]))];
  return labels.length === 0 ? 'an unrecorded source' : labels.join(' + ');
}

/** `synced today`, `synced 3 days ago`, and the date once counting days stops helping. */
export function vocabularySyncedLabel(createdAt: number, now: number): string {
  return `synced ${formatRelativeDay(createdAt, now)}`;
}

/** The count on its own: `340 words`, `1 word`. */
export function vocabularyCountLabel(count: number): string {
  return formatCountOf(count, 'word');
}

/** `From Anki · synced today` — where the words came from and how current they are. */
export function vocabularyProvenanceLabel(snapshot: VocabularySnapshot, now: number): string {
  return `From ${vocabularySourceSummary(snapshot.sourceKinds)} · ${vocabularySyncedLabel(snapshot.createdAt, now)}`;
}

/**
 * What a learner below the generation floor needs to know.
 *
 * Null once there are enough words, so the line disappears rather than
 * congratulating anyone for passing a threshold they never saw.
 */
export function generationShortfallLabel(count: number): string | null {
  if (count >= GENERATION_SNAPSHOT_MINIMUM) {
    return null;
  }
  return `Stories are written from at least ${formatCountOf(GENERATION_SNAPSHOT_MINIMUM, 'word')}.`;
}
