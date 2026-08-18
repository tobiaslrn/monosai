import type { PartOfSpeech, Token } from '../reading/token';
import { normalizeLookupKey } from './kana';

/**
 * Every baseline category, in the order the dataset and the read-only in-app
 * list present them: the forms that hold a clause together first, then the
 * pieces that attach to a word.
 */
export const STRUCTURAL_BASELINE_CATEGORIES = [
  'particle',
  'copula',
  'auxiliary',
  'inflection',
  'conjunction',
  'formal-noun',
  'affix',
  'counter',
  'punctuation',
] as const;

export type StructuralBaselineCategory = (typeof STRUCTURAL_BASELINE_CATEGORIES)[number];

/**
 * One sentence-building form the learner is not expected to have in Anki.
 * The dataset deliberately excludes general content words.
 */
export interface StructuralBaselineEntry {
  readonly id: string;
  readonly category: StructuralBaselineCategory;
  readonly forms: readonly string[];
  readonly readings?: readonly string[];
  readonly partsOfSpeech: readonly PartOfSpeech[];
  readonly nameEn: string;
  readonly descriptionEn: string;
  readonly exampleJa?: string;
}

export interface StructuralBaseline {
  readonly version: string;
  readonly entries: readonly StructuralBaselineEntry[];
}

export interface StructuralBaselineMatcher {
  readonly version: string;
  readonly entryCount: number;
  match(token: Token): StructuralBaselineEntry | null;
}

function lookupKey(form: string, partOfSpeech: PartOfSpeech): string {
  return `${normalizeLookupKey(form)}\u0000${partOfSpeech}`;
}

/**
 * Compiles the baseline into a surface/lemma/reading index.
 *
 * A form may legitimately belong to more than one entry (`\u3067` is both a case
 * particle and the connective form of `\u3066`). The first entry declared in the
 * dataset wins, which keeps classification deterministic and reviewable; the
 * build script records those overlaps in the shipped artifact.
 */
export function compileStructuralBaseline(baseline: StructuralBaseline): StructuralBaselineMatcher {
  const index = new Map<string, StructuralBaselineEntry>();
  for (const entry of baseline.entries) {
    for (const form of [...entry.forms, ...(entry.readings ?? [])]) {
      for (const partOfSpeech of entry.partsOfSpeech) {
        const key = lookupKey(form, partOfSpeech);
        if (!index.has(key)) {
          index.set(key, entry);
        }
      }
    }
  }

  return {
    version: baseline.version,
    entryCount: baseline.entries.length,
    match(token: Token): StructuralBaselineEntry | null {
      const partOfSpeech = token.partOfSpeech;
      if (partOfSpeech === undefined) {
        return null;
      }
      const candidates = [token.surface, token.lemma, token.readingHiragana].filter(
        (value): value is string => value !== undefined && value.length > 0,
      );
      for (const candidate of candidates) {
        const entry = index.get(lookupKey(candidate, partOfSpeech));
        if (entry !== undefined) {
          return entry;
        }
      }
      return null;
    },
  };
}
