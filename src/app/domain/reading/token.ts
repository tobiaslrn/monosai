import type { SentenceId } from '../shared/ids';

/** Bounded part-of-speech enum. Library-specific tags never leave infrastructure. */
export type PartOfSpeech =
  | 'noun'
  | 'proper-noun'
  | 'pronoun'
  | 'verb'
  | 'adjective-i'
  | 'adjective-na'
  | 'adverb'
  | 'determiner'
  | 'conjunction'
  | 'particle'
  | 'auxiliary'
  | 'prefix'
  | 'suffix'
  | 'counter'
  | 'number'
  | 'interjection'
  | 'symbol'
  | 'other';

export const PART_OF_SPEECH_LABELS: Record<PartOfSpeech, string> = {
  noun: 'Noun',
  'proper-noun': 'Proper noun',
  pronoun: 'Pronoun',
  verb: 'Verb',
  'adjective-i': 'i-adjective',
  'adjective-na': 'na-adjective',
  adverb: 'Adverb',
  determiner: 'Determiner',
  conjunction: 'Conjunction',
  particle: 'Particle',
  auxiliary: 'Auxiliary',
  prefix: 'Prefix',
  suffix: 'Suffix',
  counter: 'Counter',
  number: 'Number',
  interjection: 'Interjection',
  symbol: 'Symbol',
  other: 'Other',
};

/**
 * One analyzed span of a sentence.
 *
 * Offsets are UTF-16 code-unit indexes into the immutable sentence text, so the
 * rendered sentence can always be reconstructed from untouched source slices.
 */
export interface Token {
  readonly id: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly surface: string;
  readonly lemma?: string;
  readonly readingHiragana?: string;
  readonly partOfSpeech?: PartOfSpeech;
  readonly dictionaryKeys: readonly string[];
  readonly isPunctuation: boolean;
}

export interface TokenAnalysis {
  readonly sentenceId: SentenceId;
  readonly analyzerVersion: string;
  readonly tokens: readonly Token[];
}
