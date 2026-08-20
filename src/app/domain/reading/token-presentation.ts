import { readingAddsInformation } from '../language/kana';
import type { StructuralBaselineEntry } from '../language/structural-baseline';
import type { Token } from './token';
import type { TokenValidation, TokenValidationCategory } from './validation';

/**
 * Whether a token is marked on the page at all.
 *
 * The reader marks warnings and nothing else: a word the learner has not
 * reviewed is worth interrupting the line for, whereas "you know this",
 * "this is a particle", and "this is a number" are three ways of saying the
 * text is readable, and printing them under every token buried the Japanese.
 * Everything a status has to say is still available in word details.
 */
export type TokenMarker = 'warning-vocabulary' | 'none';

/**
 * How a token is presented in the reader.
 *
 * A marked token is never marked by colour alone: it also carries a distinct
 * underline shape and an accessible label, so the meaning survives a greyscale
 * screen and a screen reader.
 */
export interface TokenStatusPresentation {
  /** Whether the token carries a marker, and which one. */
  readonly marker: TokenMarker;
  /** Short label read out with the token. */
  readonly label: string;
  /** Plain-language sentence shown in the inspector. */
  readonly explanation: string;
  /** What the learner can usefully do next, when there is something. */
  readonly nextAction: string | null;
  /**
   * Which sentence-building form was matched, when the baseline matched one.
   *
   * Kept structured rather than folded into `explanation` because the example is
   * Japanese and has to be rendered with its own `lang` attribute.
   */
  readonly structuralForm?: StructuralFormDetail;
}

/** The named baseline form behind a `structural-baseline` status. */
export interface StructuralFormDetail {
  readonly nameEn: string;
  readonly descriptionEn: string;
  readonly exampleJa?: string;
}

const PRESENTATIONS: Record<TokenValidationCategory, TokenStatusPresentation> = {
  'anki-exact': {
    marker: 'none',
    label: 'Known from Anki',
    explanation: 'You have reviewed this expression in Anki.',
    nextAction: null,
  },
  'anki-normalized': {
    marker: 'none',
    label: 'Known normalized form',
    explanation: 'This is an inflected or respelled form of an expression you have reviewed.',
    nextAction: null,
  },
  'anki-phrase': {
    marker: 'none',
    label: 'Known from Anki',
    explanation: 'These words together match a phrase you have reviewed.',
    nextAction: null,
  },
  'structural-baseline': {
    marker: 'none',
    label: 'Structural grammar',
    explanation:
      'This is sentence-building grammar, such as a particle or an ending. Monosai always treats it as readable rather than as vocabulary.',
    nextAction: null,
  },
  entity: {
    marker: 'none',
    label: 'Recognized entity',
    explanation: 'This is a name, number, date, or time, recognized from its form.',
    nextAction: null,
  },
  'policy-exception': {
    marker: 'none',
    label: 'Policy exception',
    explanation: 'Your exception policy allowed this word even though you have not reviewed it.',
    nextAction: null,
  },
  'not-in-snapshot': {
    marker: 'warning-vocabulary',
    label: 'Not in current vocabulary',
    explanation: 'This word is not in your most recent reviewed vocabulary.',
    nextAction: 'Review this word in Anki, then refresh your vocabulary.',
  },
  unknown: {
    marker: 'warning-vocabulary',
    label: 'Unknown vocabulary',
    explanation: 'This word could not be matched to your reviewed vocabulary.',
    nextAction: 'Review this word in Anki, then refresh your vocabulary.',
  },
  punctuation: {
    marker: 'none',
    label: 'Punctuation',
    explanation: 'Punctuation.',
    nextAction: null,
  },
};

/**
 * The table is a total `Record` over the category union, so adding a validation
 * category without a presentation is a compile error rather than a blank marker.
 *
 * A `structural-baseline` status carries the id of the form that matched, so
 * when the caller can resolve it the learner is told which form it was rather
 * than only that it was grammar. The generic text stands when it cannot be
 * resolved, which is what happens for an analysis stored under an older bundle.
 */
export function presentStatus(
  validation: TokenValidation,
  baselineEntry?: StructuralBaselineEntry | null,
): TokenStatusPresentation {
  const presentation = PRESENTATIONS[validation.category];
  if (validation.category !== 'structural-baseline' || !baselineEntry) {
    return presentation;
  }
  return {
    ...presentation,
    structuralForm: {
      nameEn: baselineEntry.nameEn,
      descriptionEn: baselineEntry.descriptionEn,
      ...(baselineEntry.exampleJa === undefined ? {} : { exampleJa: baselineEntry.exampleJa }),
    },
  };
}

/**
 * Whether a token is worth opening.
 *
 * Punctuation and whitespace carry nothing to inspect, so making them buttons
 * would add focus stops that lead nowhere.
 */
export function isInspectable(token: Token): boolean {
  return !token.isPunctuation && token.surface.trim().length > 0;
}

/**
 * The ruby text for a token, or `null` when ruby would add nothing.
 *
 * Readings are whole-token, and a kana-only token or a reading identical to its
 * surface is suppressed rather than printed twice.
 */
export function rubyFor(token: Token): string | null {
  const reading = token.readingHiragana;
  if (reading === undefined || token.isPunctuation) {
    return null;
  }
  return readingAddsInformation(token.surface, reading) ? reading : null;
}
