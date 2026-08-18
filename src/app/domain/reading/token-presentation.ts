import { readingAddsInformation } from '../language/kana';
import type { Token } from './token';
import type { TokenValidation, TokenValidationCategory } from './validation';

/**
 * How a token is presented in the reader.
 *
 * Status is never carried by colour alone: every category also has a distinct
 * underline treatment and an accessible label, so the meaning survives a
 * greyscale screen and a screen reader.
 */
export interface TokenStatusPresentation {
  /** Modifier appended to the token class, which selects the underline style. */
  readonly marker: string;
  /** Short label read out with the token. */
  readonly label: string;
  /** Plain-language sentence shown in the inspector. */
  readonly explanation: string;
  /** What the learner can usefully do next, when there is something. */
  readonly nextAction: string | null;
}

const PRESENTATIONS: Record<TokenValidationCategory, TokenStatusPresentation> = {
  'anki-exact': {
    marker: 'known',
    label: 'Known from Anki',
    explanation: 'You have reviewed this expression in Anki.',
    nextAction: null,
  },
  'anki-normalized': {
    marker: 'normalized',
    label: 'Known normalized form',
    explanation: 'This is an inflected or respelled form of an expression you have reviewed.',
    nextAction: null,
  },
  'anki-phrase': {
    marker: 'known',
    label: 'Known from Anki',
    explanation: 'These words together match a phrase you have reviewed.',
    nextAction: null,
  },
  'structural-baseline': {
    marker: 'structural',
    label: 'Structural grammar',
    explanation:
      'This is sentence-building grammar, such as a particle or an ending. Monosai always treats it as readable rather than as vocabulary.',
    nextAction: null,
  },
  entity: {
    marker: 'entity',
    label: 'Recognized entity',
    explanation: 'This is a name, number, date, or time, recognized from its form.',
    nextAction: null,
  },
  'policy-exception': {
    marker: 'exception',
    label: 'Policy exception',
    explanation: 'Your exception policy allowed this word even though you have not reviewed it.',
    nextAction: null,
  },
  'not-in-snapshot': {
    marker: 'not-in-snapshot',
    label: 'Not in current vocabulary',
    explanation: 'This word is not in your most recent reviewed vocabulary.',
    nextAction: 'Review this word in Anki, then refresh your vocabulary.',
  },
  unknown: {
    marker: 'unknown',
    label: 'Unknown vocabulary',
    explanation: 'This word could not be matched to your reviewed vocabulary.',
    nextAction: 'Review this word in Anki, then refresh your vocabulary.',
  },
  punctuation: {
    marker: 'punctuation',
    label: 'Punctuation',
    explanation: 'Punctuation.',
    nextAction: null,
  },
};

/**
 * The table is a total `Record` over the category union, so adding a validation
 * category without a presentation is a compile error rather than a blank marker.
 */
export function presentStatus(validation: TokenValidation): TokenStatusPresentation {
  return PRESENTATIONS[validation.category];
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
