import type { SentenceSegment } from '../language/segmentation';
import { splitIntoParagraphs } from '../language/segmentation';
import type { DraftParagraph, DraftSentence, ImportDraft } from './import-draft';
import { defined } from '../shared/invariant';

/**
 * Turns segmented source text into the transient structure used while saving.
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
  const buckets = splitIntoParagraphs(text).map((range) => ({
    range,
    sentences: [] as DraftSentence[],
  }));

  let paragraphIndex = 0;
  for (const segment of segments) {
    // Segments are slices of `text`, so there is at least one paragraph.
    let paragraph = defined(buckets[paragraphIndex], 'buildImportDraft paragraph');
    // Segments arrive in source order, so the paragraph cursor only moves
    // forward instead of being searched for on every sentence.
    let following = buckets[paragraphIndex + 1];
    while (following !== undefined && segment.startUtf16 >= paragraph.range.endUtf16) {
      paragraphIndex += 1;
      paragraph = following;
      following = buckets[paragraphIndex + 1];
    }

    const sentenceText = segment.text.trim();
    if (sentenceText.length === 0) {
      continue;
    }
    paragraph.sentences.push({
      id: nextId(),
      text: sentenceText,
      tokens: null,
    });
  }

  const paragraphs: DraftParagraph[] = [];
  for (const { range, sentences } of buckets) {
    // A paragraph of nothing but blank lines has no sentences and no reason to
    // exist in the saved reading.
    if (sentences.length === 0) {
      continue;
    }
    paragraphs.push({
      id: nextId(),
      sourceText: range.text,
      sentences,
    });
  }

  return { paragraphs };
}
