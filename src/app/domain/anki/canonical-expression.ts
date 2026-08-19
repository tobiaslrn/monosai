import { hashCanonical, type Hasher } from '../shared/hashing';

/**
 * The form used for identity and hashing.
 *
 * NFKC plus the newline normalization already applied during extraction is the
 * whole transformation. It exists so that two fields differing only in Unicode
 * composition are recognized as the same entry — it is not a place to change
 * lexical content, so half-width kana becoming full-width is intended while
 * splitting, stripping punctuation, or rewriting orthography is not.
 */
export function canonicalizeExpression(visible: string): string {
  return visible.normalize('NFKC');
}

/** Content address of one canonical expression, used to merge exact duplicates. */
export function expressionHashOf(hasher: Hasher, canonical: string): string {
  return hashCanonical(hasher, 'vocabulary-expression', canonical);
}
