import type { Token } from './token';

/**
 * The transient structure of an import, before anything is saved.
 *
 * Sentences carry temporary ids so analysis results can be matched to the
 * sentence they belong to. Tokens are `null` while a sentence is awaiting
 * analysis; nothing may be saved in that state.
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

/** Sentences still awaiting analysis. */
export function unanalyzedSentences(draft: ImportDraft): readonly DraftSentence[] {
  return draft.paragraphs.flatMap((paragraph) =>
    paragraph.sentences.filter((sentence) => sentence.tokens === null),
  );
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
