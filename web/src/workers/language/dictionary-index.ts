import {
  DICTIONARY_RESULT_LIMIT,
  type DictionaryEntry,
  type DictionaryLookup,
  type DictionaryMatchBasis,
  type DictionaryQuery,
} from '../../app/domain/language/dictionary';
import { isKanaOnly, normalizeLookupKey } from '../../app/domain/language/kana';
import type { PartOfSpeech, VerbConjugationFamily } from '../../app/domain/reading/token';
import type { RawDictionaryEntry } from '../../app/infrastructure/language/language-asset.schema';

function toEntry(raw: RawDictionaryEntry): DictionaryEntry {
  return {
    id: raw.i,
    writtenForms: raw.w,
    readings: raw.k,
    senses: raw.s.map((sense) => ({ partsOfSpeech: sense.p, glossesEn: sense.g })),
  };
}

function addKey(index: Map<string, number[]>, key: string, entryIndex: number): void {
  if (key.length === 0) {
    return;
  }
  const bucket = index.get(key);
  if (bucket === undefined) {
    index.set(key, [entryIndex]);
  } else if (!bucket.includes(entryIndex)) {
    bucket.push(entryIndex);
  }
}

/**
 * Compact in-memory lookup index over the bundled dictionary.
 *
 * The shipped artifact stores entries only; the index is rebuilt in the worker
 * at initialization, which keeps the downloaded asset small and keeps the
 * dictionary out of the user's database entirely.
 */
export class DictionaryIndex {
  private constructor(
    private readonly entries: readonly RawDictionaryEntry[],
    private readonly exact: Map<string, number[]>,
    private readonly normalized: Map<string, number[]>,
  ) {}

  static build(entries: readonly RawDictionaryEntry[]): DictionaryIndex {
    const exact = new Map<string, number[]>();
    const normalized = new Map<string, number[]>();
    entries.forEach((entry, entryIndex) => {
      for (const form of [...entry.w, ...entry.k]) {
        addKey(exact, form, entryIndex);
        addKey(normalized, normalizeLookupKey(form), entryIndex);
      }
    });
    return new DictionaryIndex(entries, exact, normalized);
  }

  get size(): number {
    return this.entries.length;
  }

  private resolve(indexes: readonly number[], limit: number): readonly DictionaryEntry[] {
    return indexes.slice(0, limit).map((entryIndex) => toEntry(this.entries[entryIndex]));
  }

  private compatible(indexes: readonly number[], partOfSpeech: PartOfSpeech): readonly number[] {
    return indexes.filter((entryIndex) =>
      this.entries[entryIndex].s.some((sense) => sense.p.includes(partOfSpeech)),
    );
  }

  private compatibleWithVerbFamily(
    indexes: readonly number[],
    family: VerbConjugationFamily,
    partOfSpeech?: PartOfSpeech,
  ): readonly number[] {
    return indexes.filter((entryIndex) =>
      this.entries[entryIndex].s.some(
        (sense) =>
          sense.c?.includes(family) === true &&
          (partOfSpeech === undefined || sense.p.includes(partOfSpeech)),
      ),
    );
  }

  /** Stable tie-breaker for a kana spelling JMdict explicitly says is usual. */
  private rankKanaPreferred(
    indexes: readonly number[],
    lookupKey: string,
    partOfSpeech?: PartOfSpeech,
    family?: VerbConjugationFamily,
  ): readonly number[] {
    if (!isKanaOnly(lookupKey)) {
      return indexes;
    }
    const preferred = (entryIndex: number): boolean =>
      this.entries[entryIndex].s.some(
        (sense) =>
          sense.u === true &&
          (partOfSpeech === undefined || sense.p.includes(partOfSpeech)) &&
          (family === undefined || sense.c?.includes(family) === true),
      );
    return [...indexes].sort((left, right) => Number(preferred(right)) - Number(preferred(left)));
  }

  /**
   * The exact hits for a query, in the order they are preferred.
   *
   * A word looked up under an inflected spelling carries its dictionary form as
   * the lemma, and both are exact keys.
   */
  private exactCandidates(
    query: DictionaryQuery,
  ): readonly [DictionaryMatchBasis, string, number[]][] {
    const candidates: [DictionaryMatchBasis, string, number[]][] = [];
    const bySurface = this.exact.get(query.surface);
    if (bySurface !== undefined) {
      candidates.push(['surface', query.surface, [...bySurface]]);
    }
    if (query.lemma !== undefined && query.lemma.length > 0 && query.lemma !== query.surface) {
      const byLemma = this.exact.get(query.lemma);
      if (byLemma !== undefined) {
        candidates.push(['lemma', query.lemma, [...byLemma]]);
      }
    }
    return candidates;
  }

  /**
   * Applies the documented lookup order: exact spelling with a compatible part
   * of speech, exact lemma, reading with a compatible part of speech, an exact
   * spelling whose part of speech did not agree, and finally the canonical
   * orthographic variants the dataset groups into one entry.
   *
   * The part of speech gates the exact hits rather than only the reading,
   * because a spelling can be shared by unrelated words: the あり of あります is
   * spelled like 蟻, "ant", and only the analyzer's verb tag tells them apart.
   * An incompatible exact hit is still returned when nothing else matched — a
   * disagreeing tag is weaker evidence than no entry at all.
   */
  lookup(query: DictionaryQuery): DictionaryLookup {
    const limit = query.limit ?? DICTIONARY_RESULT_LIMIT;
    const candidates = this.exactCandidates(query);

    for (const [basis, lookupKey, indexes] of candidates) {
      const narrowed =
        query.partOfSpeech === undefined ? indexes : this.compatible(indexes, query.partOfSpeech);
      if (query.verbConjugationFamily !== undefined) {
        const byFamily = this.compatibleWithVerbFamily(
          narrowed,
          query.verbConjugationFamily,
          query.partOfSpeech,
        );
        if (byFamily.length > 0) {
          const ranked = this.rankKanaPreferred(
            byFamily,
            lookupKey,
            query.partOfSpeech,
            query.verbConjugationFamily,
          );
          return { matchedBy: basis, entries: this.resolve(ranked, limit) };
        }
      }
      if (narrowed.length > 0) {
        const ranked = this.rankKanaPreferred(narrowed, lookupKey, query.partOfSpeech);
        return { matchedBy: basis, entries: this.resolve(ranked, limit) };
      }
    }

    if (query.readingHiragana !== undefined && query.readingHiragana.length > 0) {
      const byReading = this.normalized.get(normalizeLookupKey(query.readingHiragana));
      if (byReading !== undefined) {
        const filtered =
          query.partOfSpeech === undefined
            ? byReading
            : this.compatible(byReading, query.partOfSpeech);
        if (filtered.length > 0) {
          if (query.verbConjugationFamily !== undefined) {
            const byFamily = this.compatibleWithVerbFamily(
              filtered,
              query.verbConjugationFamily,
              query.partOfSpeech,
            );
            if (byFamily.length > 0) {
              const ranked = this.rankKanaPreferred(
                byFamily,
                query.readingHiragana,
                query.partOfSpeech,
                query.verbConjugationFamily,
              );
              return { matchedBy: 'reading', entries: this.resolve(ranked, limit) };
            }
          }
          const ranked = this.rankKanaPreferred(
            filtered,
            query.readingHiragana,
            query.partOfSpeech,
          );
          return { matchedBy: 'reading', entries: this.resolve(ranked, limit) };
        }
      }
    }

    const fallback = candidates.at(0);
    if (fallback !== undefined) {
      return { matchedBy: fallback[0], entries: this.resolve(fallback[2], limit) };
    }

    for (const candidate of [query.surface, query.lemma]) {
      if (candidate === undefined || candidate.length === 0) {
        continue;
      }
      const byVariant = this.normalized.get(normalizeLookupKey(candidate));
      if (byVariant !== undefined) {
        const ranked = this.rankKanaPreferred(byVariant, candidate, query.partOfSpeech);
        return { matchedBy: 'variant', entries: this.resolve(ranked, limit) };
      }
    }

    return { matchedBy: 'none', entries: [] };
  }
}
