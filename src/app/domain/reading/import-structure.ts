import type { SentenceSegment } from '../language/segmentation';
import { splitIntoParagraphs } from '../language/segmentation';
import type { DraftParagraph, DraftSentence, ImportDraft } from './import-draft';

/**
 * Turns segmented source text into the structure import review works on.
 *
 * Paragraphs come from the learner's own blank lines and keep their source slice
 * exactly. Sentence text drops the line breaks and padding that end a segment:
 * those characters are structure, carried by the paragraph and the sentence
 * order, and keeping them would put stray newlines inside stored Japanese and
 * inside every later translation and audio cache key.
 */
export function buildImportDraft(
  text: string,
  segments: readonly SentenceSegment[],
  nextId: () => string,
): ImportDraft {
  const paragraphRanges = splitIntoParagraphs(text);
  const sentencesByParagraph = paragraphRanges.map((): DraftSentence[] => []);

  let paragraphIndex = 0;
  for (const segment of segments) {
    // Segments arrive in source order, so the paragraph cursor only moves
    // forward instead of being searched for on every sentence.
    while (
      paragraphIndex < paragraphRanges.length - 1 &&
      segment.startUtf16 >= paragraphRanges[paragraphIndex].endUtf16
    ) {
      paragraphIndex += 1;
    }

    const sentenceText = segment.text.trim();
    if (sentenceText.length === 0) {
      continue;
    }
    sentencesByParagraph[paragraphIndex].push({
      id: nextId(),
      text: sentenceText,
      tokens: null,
    });
  }

  const paragraphs: DraftParagraph[] = [];
  for (let index = 0; index < paragraphRanges.length; index += 1) {
    const sentences = sentencesByParagraph[index];
    // A paragraph of nothing but blank lines has no sentences and no reason to
    // exist in the saved reading.
    if (sentences.length === 0) {
      continue;
    }
    paragraphs.push({
      id: nextId(),
      sourceText: paragraphRanges[index].text,
      sentences,
    });
  }

  return { paragraphs };
}
