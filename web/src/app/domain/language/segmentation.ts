/**
 * Deterministic Japanese-aware sentence segmentation.
 *
 * The rules are versioned (`SEGMENTATION_RULES_VERSION`) and implemented here
 * rather than delegated to `Intl.Segmenter`, because output must be identical on
 * every supported browser and reproducible in tests. Segments tile their input
 * exactly: concatenating them reproduces the source character for character.
 */

const OPENERS = new Set(['「', '『', '（', '【', '〈', '《', '〔', '［', '｛', '(', '“', '‘']);
const CLOSERS = new Set(['」', '』', '）', '】', '〉', '》', '〕', '］', '｝', ')', '”', '’']);
const JAPANESE_TERMINATORS = new Set(['。', '！', '？', '．']);
/** ASCII marks also appear inside abbreviations, so they need a following break. */
const ASCII_TERMINATORS = new Set(['.', '!', '?']);
const INLINE_SPACES = new Set([' ', '\u3000', '\t']);
const SOFT_BREAKS = new Set(['、', '，', ',', '；', ';', '：', ':', ' ', '\u3000', '\t']);
/** Prevent one missing full stop from creating an unbounded sentence-scoped operation. */
export const MAXIMUM_SENTENCE_CHARACTERS = 240;

export interface SentenceSegment {
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly text: string;
}

export interface ParagraphSegment {
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly text: string;
}

function characterAt(text: string, index: number): string {
  return String.fromCodePoint(text.codePointAt(index) ?? 0);
}

function isTerminator(text: string, index: number): boolean {
  const character = characterAt(text, index);
  if (JAPANESE_TERMINATORS.has(character)) {
    return true;
  }
  if (!ASCII_TERMINATORS.has(character)) {
    return false;
  }
  const next = index + character.length;
  if (next >= text.length) {
    return true;
  }
  const following = characterAt(text, next);
  return (
    INLINE_SPACES.has(following) ||
    following === '\n' ||
    CLOSERS.has(following) ||
    JAPANESE_TERMINATORS.has(following) ||
    ASCII_TERMINATORS.has(following)
  );
}

function skipWhile(
  text: string,
  index: number,
  matches: (text: string, index: number) => boolean,
): number {
  let cursor = index;
  while (cursor < text.length && matches(text, cursor)) {
    cursor += characterAt(text, cursor).length;
  }
  return cursor;
}

/**
 * Splits one paragraph into sentences.
 *
 * A terminator only ends a sentence at bracket depth zero, so a quoted sentence
 * such as `\u300c\u305d\u3046\u304b\u3002\u300d\u3068\u8a00\u3063\u305f\u3002` stays whole. Runs of terminators,
 * trailing closing brackets, and trailing inline spaces are absorbed into the
 * sentence they end. A newline is always a boundary, which keeps dialogue lines
 * separate.
 */
export function segmentParagraph(text: string): readonly SentenceSegment[] {
  const segments: SentenceSegment[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  let charactersSinceStart = 0;

  const emit = (end: number): void => {
    if (end > start) {
      segments.push({ startUtf16: start, endUtf16: end, text: text.slice(start, end) });
    }
    start = end;
    charactersSinceStart = 0;
  };

  while (index < text.length) {
    const character = characterAt(text, index);
    if (OPENERS.has(character)) {
      depth += 1;
      charactersSinceStart += 1;
      index += character.length;
      continue;
    }
    if (CLOSERS.has(character)) {
      depth = Math.max(0, depth - 1);
      charactersSinceStart += 1;
      index += character.length;
      continue;
    }
    if (
      depth === 0 &&
      charactersSinceStart >= MAXIMUM_SENTENCE_CHARACTERS &&
      SOFT_BREAKS.has(character)
    ) {
      const end = index + character.length;
      emit(end);
      index = end;
      continue;
    }
    if (charactersSinceStart >= MAXIMUM_SENTENCE_CHARACTERS) {
      emit(index);
      continue;
    }
    if (depth === 0 && character === '\n') {
      const end = skipWhile(text, index, (source, at) => characterAt(source, at) === '\n');
      emit(end);
      index = end;
      continue;
    }
    if (depth === 0 && isTerminator(text, index)) {
      let end = skipWhile(text, index, isTerminator);
      end = skipWhile(text, end, (source, at) => CLOSERS.has(characterAt(source, at)));
      end = skipWhile(text, end, (source, at) => INLINE_SPACES.has(characterAt(source, at)));
      emit(end);
      index = end;
      continue;
    }
    charactersSinceStart += 1;
    index += character.length;
  }

  emit(text.length);
  return segments;
}

/**
 * Splits a document into paragraphs on blank lines, preserving every character.
 * Trailing newlines belong to the paragraph they close.
 */
export function splitIntoParagraphs(text: string): readonly ParagraphSegment[] {
  const paragraphs: ParagraphSegment[] = [];
  const boundary = /\n[ \t\u3000]*\n[\s]*/g;
  let start = 0;
  let match = boundary.exec(text);
  while (match !== null) {
    const end = match.index + match[0].length;
    paragraphs.push({ startUtf16: start, endUtf16: end, text: text.slice(start, end) });
    start = end;
    match = boundary.exec(text);
  }
  if (start < text.length) {
    paragraphs.push({ startUtf16: start, endUtf16: text.length, text: text.slice(start) });
  }
  return paragraphs;
}
