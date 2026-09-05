import { PART_OF_SPEECH_LABELS, type Token } from './token';
import type { WordGroup } from './token-grouping';

/**
 * The compact facts a word lookup can say without explaining a derivation.
 *
 * `formLabels` is deliberately a list rather than one sentence: every label is
 * a bounded classification supported by the analyzer output, and the order is
 * stable for both the popup and tests. An empty list means that the lookup has
 * no useful high-level form classification to print.
 */
export interface WordFormSummary {
  readonly dictionaryForm: string;
  readonly partOfSpeech: string | null;
  readonly formLabels: readonly string[];
}

const POLITE = new Set(['ます', 'です']);
const CAUSATIVE = new Set(['せる', 'させる']);
const PASSIVE_OR_POTENTIAL = new Set(['れる', 'られる']);
const ONGOING = new Set(['いる', 'おる']);
const DESIDERATIVE = new Set(['たい', 'たがる']);
const NEGATIVE = new Set(['ない', 'ぬ', 'ん', 'まい']);
const VOLITIONAL = new Set(['う', 'よう']);
const REQUEST = new Set(['くださる']);
const TE_PARTICLES = new Set(['て', 'で']);
const CONJUGATING_CLASSES = new Set(['verb', 'adjective-i', 'auxiliary']);

function lemma(token: Token): string {
  return token.lemma ?? token.surface;
}

function hasLemma(tokens: readonly Token[], candidates: ReadonlySet<string>): boolean {
  return tokens.some((token) => candidates.has(lemma(token)));
}

function hasTeForm(head: Token, attachedTokens: readonly Token[]): boolean {
  return attachedTokens.some(
    (token, index) =>
      token.partOfSpeech === 'particle' &&
      TE_PARTICLES.has(token.surface) &&
      (index === 0
        ? CONJUGATING_CLASSES.has(head.partOfSpeech ?? '')
        : CONJUGATING_CLASSES.has(attachedTokens[index - 1].partOfSpeech ?? '')),
  );
}

/**
 * Turns the analyzer's local evidence into the small form line shown in the
 * lookup. No structural-baseline prose or inferred intermediate forms enter
 * this result. In particular, a continuative-ta stem is not called past unless
 * the analyzer also emitted the past auxiliary た.
 */
function formLabels(head: Token, attachedTokens: readonly Token[]): readonly string[] {
  const polite = hasLemma(attachedTokens, POLITE);
  const hasCausative = hasLemma(attachedTokens, CAUSATIVE);
  const hasPassiveOrPotential = hasLemma(attachedTokens, PASSIVE_OR_POTENTIAL);
  const hasTe = hasTeForm(head, attachedTokens);
  const hasOngoing = hasLemma(attachedTokens, ONGOING);
  const hasDesiderative = hasLemma(attachedTokens, DESIDERATIVE);
  const hasNegative = hasLemma(attachedTokens, NEGATIVE);
  const hasPast = attachedTokens.some((token) => lemma(token) === 'た');
  const hasVolitional =
    hasLemma(attachedTokens, VOLITIONAL) || head.inflectionForm === 'irrealis-volitional';
  const hasConditional =
    head.inflectionForm === 'hypothetical' || attachedTokens.some((token) => lemma(token) === 'ば');
  const hasImperative = head.inflectionForm === 'imperative';
  const hasRequest = hasLemma(attachedTokens, REQUEST);

  const useful =
    hasCausative ||
    hasPassiveOrPotential ||
    hasTe ||
    hasOngoing ||
    hasDesiderative ||
    hasNegative ||
    hasPast ||
    hasVolitional ||
    hasConditional ||
    hasImperative ||
    hasRequest;

  // Polite is useful on its own. Plain is only useful as the contrast to
  // another form label; a bare dictionary-form word gets no form line.
  if (!useful && !polite) {
    return [];
  }

  const labels: string[] = [polite ? 'Polite' : 'Plain'];
  if (hasCausative) {
    labels.push('causative');
  }
  if (hasPassiveOrPotential) {
    labels.push('passive / potential');
  }
  if (hasTe) {
    labels.push('te-form');
  }
  if (hasOngoing) {
    labels.push('ongoing');
  }
  if (hasDesiderative) {
    labels.push('want to');
  }
  if (hasNegative) {
    labels.push('negative');
  }
  if (hasPast) {
    labels.push('past');
  }
  if (hasVolitional) {
    labels.push('volitional');
  }
  if (hasConditional) {
    labels.push('conditional');
  }
  if (hasImperative) {
    labels.push('imperative');
  }
  if (hasRequest) {
    labels.push('request');
  }
  return labels;
}

/**
 * Summarizes one grouped word using only the local token analysis.
 *
 * The dictionary form and part of speech are always available as far as the
 * analyzer provides them. Form labels are omitted when the evidence is absent
 * or does not support one of the bounded classifications above.
 */
export function summarizeWordForm(word: WordGroup): WordFormSummary {
  const headIndex = word.tokens.findIndex((token) => token.id === word.head.id);
  const attachedTokens = headIndex < 0 ? [] : word.tokens.slice(headIndex + 1);
  const partOfSpeech = word.head.partOfSpeech;

  return {
    dictionaryForm: word.head.lemma ?? word.head.surface,
    partOfSpeech:
      partOfSpeech === undefined ? null : PART_OF_SPEECH_LABELS[partOfSpeech].toLowerCase(),
    formLabels: formLabels(word.head, attachedTokens),
  };
}
