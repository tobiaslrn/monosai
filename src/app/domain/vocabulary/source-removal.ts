import type { VocabularySource } from './vocabulary-source';
import { isIncludedInVocabulary } from './vocabulary-source';

/** What the page knows about the rest of the vocabulary when a removal is asked for. */
export interface SourceRemovalContext {
  /** Every configured source, including the one being removed. */
  readonly sources: readonly VocabularySource[];
  /** Saved stories generated from the current vocabulary. */
  readonly storyCount: number;
}

/** The concrete consequences of removing one source, in the learner's terms. */
export interface SourceRemovalPlan {
  readonly title: string;
  readonly removes: readonly string[];
  readonly preserves: readonly string[];
  /** True when nothing else would be left to build a vocabulary from. */
  readonly emptiesVocabulary: boolean;
}

/**
 * Describes a removal before it happens.
 *
 * Removing a source is not the same as excluding it: exclusion keeps the source
 * and everything read from it, and is undone by ticking the box again. Removal
 * throws the stored read away, so the dialog has to say what disappears with it
 * — including the stories that were generated from this vocabulary, which is
 * the number the card was already showing when the button was pressed.
 */
export function describeSourceRemoval(
  source: VocabularySource,
  context: SourceRemovalContext,
): SourceRemovalPlan {
  const others = context.sources.filter(
    (candidate) => candidate.id !== source.id && isIncludedInVocabulary(candidate),
  );
  const emptiesVocabulary = isIncludedInVocabulary(source) && others.length === 0;

  const removes = [
    `${source.label}, and the words it contributes to your vocabulary`,
    ...(emptiesVocabulary
      ? ['Every word in your vocabulary: no other source is included, so it drops to none']
      : [
          `The words no other source has. Your vocabulary keeps everything ${countLabel(others)} still provides`,
        ]),
    ...(context.storyCount > 0
      ? [
          `The vocabulary ${storyLabel(context.storyCount)} generated from, so their words are remarked`,
        ]
      : []),
  ];

  return {
    title: `Remove ${source.label}?`,
    removes,
    // Lowercase: these are joined into one sentence when rendered.
    preserves: [
      'your stories',
      source.kind === 'text-list' ? 'nothing else on this device' : 'your Anki collection',
    ],
    emptiesVocabulary,
  };
}

function countLabel(others: readonly VocabularySource[]): string {
  return others.length === 1
    ? 'your 1 other source'
    : `your ${String(others.length)} other sources`;
}

function storyLabel(count: number): string {
  return count === 1 ? '1 story was' : `${String(count)} stories were`;
}
