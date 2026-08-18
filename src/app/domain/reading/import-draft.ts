import type { Token } from './token';

/**
 * The reviewable structure of an import, before anything is saved.
 *
 * Sentences carry temporary ids that are stable across split and merge, so the
 * review UI can keep focus and live-region messages attached to the row the
 * learner is working on. Tokens are `null` when a boundary changed and the
 * sentence has not been re-analyzed yet; nothing may be saved in that state.
 */
export interface DraftSentence {
  readonly id: string;
  readonly text: string;
  readonly tokens: readonly Token[] | null;
}

export interface DraftParagraph {
  readonly id: string;
  /** The exact source slice, including the whitespace that ends the paragraph. */
  readonly sourceText: string;
  readonly sentences: readonly DraftSentence[];
}

export interface ImportDraft {
  readonly paragraphs: readonly DraftParagraph[];
}

export type DraftEditCode =
  | 'sentence-not-found'
  | 'split-offset-out-of-range'
  | 'split-produces-empty'
  | 'no-previous-sentence'
  | 'no-next-sentence';

export interface DraftEditFailure {
  readonly code: DraftEditCode;
  readonly message: string;
}

export type DraftEditResult =
  | {
      readonly ok: true;
      readonly draft: ImportDraft;
      /** Sentences whose text changed and therefore need re-analysis. */
      readonly changedSentenceIds: readonly string[];
      /** What to announce in the review live region. */
      readonly announcement: string;
    }
  | { readonly ok: false; readonly failure: DraftEditFailure };

function failure(code: DraftEditCode, message: string): DraftEditResult {
  return { ok: false, failure: { code, message } };
}

export function totalSentenceCount(draft: ImportDraft): number {
  return draft.paragraphs.reduce((total, paragraph) => total + paragraph.sentences.length, 0);
}

/** Sentences still awaiting re-analysis after an edit. */
export function unanalyzedSentences(draft: ImportDraft): readonly DraftSentence[] {
  return draft.paragraphs.flatMap((paragraph) =>
    paragraph.sentences.filter((sentence) => sentence.tokens === null),
  );
}

export function findSentence(draft: ImportDraft, sentenceId: string): DraftSentence | null {
  for (const paragraph of draft.paragraphs) {
    const found = paragraph.sentences.find((sentence) => sentence.id === sentenceId);
    if (found) {
      return found;
    }
  }
  return null;
}

interface Located {
  readonly paragraphIndex: number;
  readonly sentenceIndex: number;
}

function locate(draft: ImportDraft, sentenceId: string): Located | null {
  for (let paragraphIndex = 0; paragraphIndex < draft.paragraphs.length; paragraphIndex += 1) {
    const sentenceIndex = draft.paragraphs[paragraphIndex].sentences.findIndex(
      (sentence) => sentence.id === sentenceId,
    );
    if (sentenceIndex !== -1) {
      return { paragraphIndex, sentenceIndex };
    }
  }
  return null;
}

function replaceSentences(
  draft: ImportDraft,
  paragraphIndex: number,
  sentences: readonly DraftSentence[],
): ImportDraft {
  const paragraphs = draft.paragraphs.map((paragraph, index) =>
    index === paragraphIndex ? { ...paragraph, sentences } : paragraph,
  );
  return { paragraphs };
}

/**
 * Splits a sentence at a caret offset.
 *
 * The offset is a UTF-16 index into the sentence text. Both halves must contain
 * something other than whitespace, because an empty sentence has no text to
 * tokenize and would save as a blank row.
 */
export function splitSentence(
  draft: ImportDraft,
  sentenceId: string,
  offsetUtf16: number,
  nextId: () => string,
): DraftEditResult {
  const located = locate(draft, sentenceId);
  if (located === null) {
    return failure('sentence-not-found', 'That sentence is no longer in the review.');
  }

  const paragraph = draft.paragraphs[located.paragraphIndex];
  const sentence = paragraph.sentences[located.sentenceIndex];

  if (!Number.isInteger(offsetUtf16) || offsetUtf16 <= 0 || offsetUtf16 >= sentence.text.length) {
    return failure(
      'split-offset-out-of-range',
      'Place the cursor inside the sentence to split it there.',
    );
  }

  const before = sentence.text.slice(0, offsetUtf16);
  const after = sentence.text.slice(offsetUtf16);
  if (before.trim().length === 0 || after.trim().length === 0) {
    return failure('split-produces-empty', 'Splitting there would leave an empty sentence.');
  }

  // The first half keeps the original id so focus stays where the learner was.
  const first: DraftSentence = { id: sentence.id, text: before, tokens: null };
  const second: DraftSentence = { id: nextId(), text: after, tokens: null };
  const sentences = [
    ...paragraph.sentences.slice(0, located.sentenceIndex),
    first,
    second,
    ...paragraph.sentences.slice(located.sentenceIndex + 1),
  ];

  return {
    ok: true,
    draft: replaceSentences(draft, located.paragraphIndex, sentences),
    changedSentenceIds: [first.id, second.id],
    announcement: 'Sentence split into two.',
  };
}

/**
 * Merges a sentence with its neighbour inside the same paragraph.
 *
 * Merging never crosses a paragraph boundary: paragraphs are the learner's own
 * blank-line structure and are not part of what review corrects.
 */
export function mergeSentence(
  draft: ImportDraft,
  sentenceId: string,
  direction: 'previous' | 'next',
): DraftEditResult {
  const located = locate(draft, sentenceId);
  if (located === null) {
    return failure('sentence-not-found', 'That sentence is no longer in the review.');
  }

  const paragraph = draft.paragraphs[located.paragraphIndex];
  const firstIndex = direction === 'previous' ? located.sentenceIndex - 1 : located.sentenceIndex;

  if (direction === 'previous' && located.sentenceIndex === 0) {
    return failure('no-previous-sentence', 'This is the first sentence in its paragraph.');
  }
  if (direction === 'next' && located.sentenceIndex === paragraph.sentences.length - 1) {
    return failure('no-next-sentence', 'This is the last sentence in its paragraph.');
  }

  const first = paragraph.sentences[firstIndex];
  const second = paragraph.sentences[firstIndex + 1];
  // The surviving row keeps the earlier id, so the merged sentence stays at a
  // predictable place in the focus order.
  const merged: DraftSentence = { id: first.id, text: first.text + second.text, tokens: null };
  const sentences = [
    ...paragraph.sentences.slice(0, firstIndex),
    merged,
    ...paragraph.sentences.slice(firstIndex + 2),
  ];

  return {
    ok: true,
    draft: replaceSentences(draft, located.paragraphIndex, sentences),
    changedSentenceIds: [merged.id],
    announcement: 'Sentences merged.',
  };
}

/** Applies freshly computed tokens to the sentences that were awaiting them. */
export function applyAnalysis(
  draft: ImportDraft,
  analyses: ReadonlyMap<string, readonly Token[]>,
): ImportDraft {
  return {
    paragraphs: draft.paragraphs.map((paragraph) => ({
      ...paragraph,
      sentences: paragraph.sentences.map((sentence) => {
        const tokens = analyses.get(sentence.id);
        return tokens === undefined ? sentence : { ...sentence, tokens };
      }),
    })),
  };
}
