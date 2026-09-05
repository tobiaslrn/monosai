import { normalizeLineEndings } from '../shared/canonical-json';
import { hashCanonical, type Hasher } from '../shared/hashing';

/** Bumped when the exception-review prompt changes what the policy means. */
export const EXCEPTION_PROMPT_VERSION = 1;

/**
 * Normalizes policy text so that edits which cannot change the instruction do
 * not invalidate captured exception reviews.
 *
 * Composition form, line-ending style, trailing spaces, and blank-line padding
 * all survive a round trip through a textarea without the learner intending
 * anything by them.
 */
export function normalizePolicyText(text: string): string {
  return normalizeLineEndings(text.normalize('NFC'))
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function exceptionPolicyHash(hasher: Hasher, text: string): string {
  const normalized = normalizePolicyText(text);
  if (normalized === '') {
    return '';
  }
  return hashCanonical(hasher, 'exception-policy', {
    text: normalized,
    promptVersion: EXCEPTION_PROMPT_VERSION,
  });
}
