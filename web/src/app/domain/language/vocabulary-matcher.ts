import type { VocabularyItemId } from '../shared/ids';
import type { PartOfSpeech, Token } from '../reading/token';
import type { VocabularyItem } from '../vocabulary/snapshot';
import { isKanaOnly, normalizeLookupKey } from './kana';

/** How a normalized match was justified, shown to the learner as the basis. */
export type NormalizedMatchBasis = 'normalized-form' | 'lemma' | 'reading';

export interface PhraseMatch {
  readonly vocabularyItemId: VocabularyItemId;
  readonly startTokenIndex: number;
  readonly endTokenIndex: number;
  readonly basis: 'exact' | NormalizedMatchBasis;
}

export interface NormalizedMatch {
  readonly vocabularyItemIds: readonly VocabularyItemId[];
  readonly basis: NormalizedMatchBasis;
}

export interface VocabularyMatcher {
  readonly itemCount: number;
  /** Longest phrase of two or more tokens starting exactly at `startIndex`. */
  findPhraseAt(tokens: readonly Token[], startIndex: number): PhraseMatch | null;
  /** Items whose canonical expression is exactly this token's surface. */
  findExact(token: Token): readonly VocabularyItemId[];
  /** Items reachable through allowed normalization only. */
  findNormalized(token: Token): NormalizedMatch | null;
}

interface TrieNode {
  readonly children: Map<string, TrieNode>;
  readonly itemIds: VocabularyItemId[];
}

interface TrieHit {
  readonly itemId: VocabularyItemId;
  readonly endTokenIndex: number;
}

function newNode(): TrieNode {
  return { children: new Map(), itemIds: [] };
}

function insert(root: TrieNode, keys: readonly string[], itemId: VocabularyItemId): void {
  let node = root;
  for (const key of keys) {
    const existing = node.children.get(key);
    if (existing === undefined) {
      const created = newNode();
      node.children.set(key, created);
      node = created;
    } else {
      node = existing;
    }
  }
  if (!node.itemIds.includes(itemId)) {
    node.itemIds.push(itemId);
  }
}

function addToBucket(
  index: Map<string, VocabularyItemId[]>,
  key: string,
  itemId: VocabularyItemId,
): void {
  const bucket = index.get(key);
  if (bucket === undefined) {
    index.set(key, [itemId]);
  } else if (!bucket.includes(itemId)) {
    bucket.push(itemId);
  }
}

/**
 * Grammar classes a reading never vouches for: a particle は is not the noun 歯,
 * nor the particle て the noun 手, however often a deck holds the noun.
 */
const FUNCTION_WORD_CLASSES: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'particle',
  'auxiliary',
  'prefix',
  'suffix',
  'symbol',
]);

/**
 * Whether a token may be matched by its reading alone.
 *
 * Only a content word spelled in kana: はし is a spelling of 橋 the learner can
 * read, while 紙 is a different word from 神 although both are read かみ. A
 * token written with kanji is matched by its written form or its base form,
 * never by how it sounds.
 */
export function acceptsReadingMatch(token: Pick<Token, 'surface' | 'partOfSpeech'>): boolean {
  return (
    isKanaOnly(token.surface.normalize('NFKC')) &&
    (token.partOfSpeech === undefined || !FUNCTION_WORD_CLASSES.has(token.partOfSpeech))
  );
}

/**
 * Keys a running-text token is compared with item forms under: its written
 * form and its base form. A reading is no key of its own; it only matters for
 * a kana spelling, whose written form already is one.
 */
function formKeys(
  token: Token,
): readonly { readonly key: string; readonly basis: NormalizedMatchBasis }[] {
  const keys: { key: string; basis: NormalizedMatchBasis }[] = [
    { key: normalizeLookupKey(token.surface), basis: 'normalized-form' },
  ];
  if (token.lemma !== undefined && token.lemma.length > 0) {
    keys.push({ key: normalizeLookupKey(token.lemma), basis: 'lemma' });
  }
  return keys;
}

/**
 * Longest match starting at `index`.
 *
 * Only sequences of two or more tokens are stored, so any node carrying item ids
 * is at least two levels deep and a hit can never mask a single-token entry.
 */
function longestMatch(
  node: TrieNode,
  tokens: readonly Token[],
  index: number,
  keysFor: (token: Token) => readonly string[],
): TrieHit | null {
  const token = tokens[index];
  if (token === undefined) {
    return null;
  }
  let best: TrieHit | null = null;
  for (const key of keysFor(token)) {
    const child = node.children.get(key);
    if (child === undefined) {
      continue;
    }
    const [itemId] = child.itemIds;
    if (itemId !== undefined && (best === null || index > best.endTokenIndex)) {
      best = { itemId, endTokenIndex: index };
    }
    const deeper = longestMatch(child, tokens, index + 1, keysFor);
    if (deeper !== null && (best === null || deeper.endTokenIndex > best.endTokenIndex)) {
      best = deeper;
    }
  }
  return best;
}

/**
 * Compiles one vocabulary snapshot result into the matcher used by
 * classification.
 *
 * Four indexes are built: exact canonical surfaces, normalized single-token
 * forms (Unicode form and tokenizer lemma), single-token readings, and a
 * phrase trie for entries of two or more tokens. A token's written and base
 * forms are looked up among the forms; only a kana spelling that
 * `acceptsReadingMatch` allows is looked up among the readings, so neither a
 * homophone nor a particle that sounds like a reviewed word counts as known.
 * Nothing here accepts synonyms, edit distance, or shared kanji as evidence of
 * known vocabulary.
 */
export function compileVocabularyMatcher(items: readonly VocabularyItem[]): VocabularyMatcher {
  const exact = new Map<string, VocabularyItemId[]>();
  const forms = new Map<string, VocabularyItemId[]>();
  const readings = new Map<string, VocabularyItemId[]>();
  const exactPhrases = newNode();
  const normalizedPhrases = newNode();

  for (const item of items) {
    const sequence = item.analyzedSequence;

    // The whole expression is always a single-token key as well: an entry
    // analyzed alone as several tokens (十分 as 十 + 分) can be one token in
    // running text (これで十分です), and its literal form is still exact evidence.
    addToBucket(exact, item.canonicalExpression, item.id);
    addToBucket(forms, normalizeLookupKey(item.canonicalExpression), item.id);

    if (sequence.length >= 2) {
      insert(
        exactPhrases,
        sequence.map((token) => token.surface),
        item.id,
      );
      insert(
        normalizedPhrases,
        sequence.map((token) => normalizeLookupKey(token.surface)),
        item.id,
      );
    }
    // Per-token lemmas and readings describe the whole entry only when it is one
    // token; joined across a split they can name a different word (じゅうふん).
    const tokenKeys = sequence.length === 1 ? sequence : [];
    for (const token of tokenKeys) {
      if (token.lemma !== undefined && token.lemma.length > 0) {
        addToBucket(forms, normalizeLookupKey(token.lemma), item.id);
      }
      if (token.readingHiragana !== undefined && token.readingHiragana.length > 0) {
        addToBucket(readings, normalizeLookupKey(token.readingHiragana), item.id);
      }
    }
  }

  return {
    itemCount: items.length,
    findPhraseAt(tokens, startIndex) {
      const exactHit = longestMatch(exactPhrases, tokens, startIndex, (token) => [token.surface]);
      if (exactHit !== null) {
        return {
          vocabularyItemId: exactHit.itemId,
          startTokenIndex: startIndex,
          endTokenIndex: exactHit.endTokenIndex,
          basis: 'exact',
        };
      }
      const normalizedHit = longestMatch(normalizedPhrases, tokens, startIndex, (token) =>
        formKeys(token).map((candidate) => candidate.key),
      );
      if (normalizedHit !== null) {
        return {
          vocabularyItemId: normalizedHit.itemId,
          startTokenIndex: startIndex,
          endTokenIndex: normalizedHit.endTokenIndex,
          basis: 'normalized-form',
        };
      }
      return null;
    },
    findExact(token) {
      return exact.get(token.surface) ?? [];
    },
    findNormalized(token) {
      for (const candidate of formKeys(token)) {
        const bucket = forms.get(candidate.key);
        if (bucket !== undefined) {
          return { vocabularyItemIds: bucket, basis: candidate.basis };
        }
      }
      if (acceptsReadingMatch(token)) {
        const bucket = readings.get(normalizeLookupKey(token.surface));
        if (bucket !== undefined) {
          return { vocabularyItemIds: bucket, basis: 'reading' };
        }
      }
      return null;
    },
  };
}
