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
 * Bounded inflection-form enum: which shape a conjugating word is in.
 *
 * The analyzer reports this for every verb, i-adjective, auxiliary, and copula.
 * It is what tells 行け (imperative) apart from 行け (conditional stem of 行けば),
 * and it is the only evidence for an inflection that adds no ending of its own.
 * Library-specific tags never leave infrastructure, exactly as with
 * `PartOfSpeech`.
 */
export type InflectionForm =
  | 'dictionary'
  | 'irrealis'
  | 'irrealis-volitional'
  | 'continuative'
  | 'continuative-ta'
  | 'continuative-te'
  | 'hypothetical'
  | 'imperative'
  | 'attributive'
  | 'stem'
  | 'other';

export const INFLECTION_FORM_LABELS: Record<InflectionForm, string> = {
  dictionary: 'Dictionary form',
  irrealis: 'Negative stem',
  'irrealis-volitional': 'Volitional stem',
  continuative: 'Continuative stem',
  'continuative-ta': 'Past stem',
  'continuative-te': 'Te stem',
  hypothetical: 'Conditional stem',
  imperative: 'Imperative',
  attributive: 'Attributive',
  stem: 'Bare stem',
  other: 'Other',
};

/**
 * The bounded verb paradigm used to disambiguate homophonous dictionary forms.
 *
 * This deliberately stops at the family boundary shared by IPADIC and JMdict;
 * library-specific row classes and JMdict codes remain in infrastructure.
 */
export type VerbConjugationFamily = 'ichidan' | 'godan' | 'irregular';

export const VERB_CONJUGATION_FAMILIES: readonly VerbConjugationFamily[] = [
  'ichidan',
  'godan',
  'irregular',
];

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
  /** Absent for a word class that does not inflect, and for an untagged token. */
  readonly inflectionForm?: InflectionForm;
  /** Present only when the analyzer identifies a bounded verb paradigm. */
  readonly verbConjugationFamily?: VerbConjugationFamily;
  readonly dictionaryKeys: readonly string[];
  readonly isPunctuation: boolean;
}

export interface TokenAnalysis {
  readonly sentenceId: SentenceId;
  readonly analyzerVersion: string;
  readonly tokens: readonly Token[];
}
