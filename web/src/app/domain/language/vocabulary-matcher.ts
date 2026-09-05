import type { VocabularyItemId } from '../shared/ids';
import type { Token } from '../reading/token';
import type { VocabularyItem } from '../vocabulary/snapshot';
import { normalizeLookupKey } from './kana';

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

function normalizedTokenKeys(
  token: Token,
): readonly { readonly key: string; readonly basis: NormalizedMatchBasis }[] {
  const keys: { key: string; basis: NormalizedMatchBasis }[] = [
    { key: normalizeLookupKey(token.surface), basis: 'normalized-form' },
  ];
  if (token.lemma !== undefined && token.lemma.length > 0) {
    keys.push({ key: normalizeLookupKey(token.lemma), basis: 'lemma' });
  }
  if (token.readingHiragana !== undefined && token.readingHiragana.length > 0) {
    keys.push({ key: normalizeLookupKey(token.readingHiragana), basis: 'reading' });
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
  if (index >= tokens.length) {
    return null;
  }
  const token = tokens[index];
  let best: TrieHit | null = null;
  for (const key of keysFor(token)) {
    const child = node.children.get(key);
    if (child === undefined) {
      continue;
    }
    if (child.itemIds.length > 0 && (best === null || index > best.endTokenIndex)) {
      best = { itemId: child.itemIds[0], endTokenIndex: index };
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
 * Three indexes are built: exact canonical surfaces, normalized single-token
 * forms (Unicode form, kana reading, and tokenizer lemma only), and a phrase
 * trie for entries of two or more tokens. Nothing here accepts synonyms, edit
 * distance, or shared kanji as evidence of known vocabulary.
 */
export function compileVocabularyMatcher(items: readonly VocabularyItem[]): VocabularyMatcher {
  const exact = new Map<string, VocabularyItemId[]>();
  const normalized = new Map<string, { ids: VocabularyItemId[]; basis: NormalizedMatchBasis }>();
  const exactPhrases = newNode();
  const normalizedPhrases = newNode();

  for (const item of items) {
    const sequence = item.analyzedSequence;
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
      continue;
    }

    addToBucket(exact, item.canonicalExpression, item.id);

    const candidates: { key: string; basis: NormalizedMatchBasis }[] = [
      { key: normalizeLookupKey(item.canonicalExpression), basis: 'normalized-form' },
    ];
    for (const token of sequence) {
      if (token.lemma !== undefined && token.lemma.length > 0) {
        candidates.push({ key: normalizeLookupKey(token.lemma), basis: 'lemma' });
      }
      if (token.readingHiragana !== undefined && token.readingHiragana.length > 0) {
        candidates.push({ key: normalizeLookupKey(token.readingHiragana), basis: 'reading' });
      }
    }
    for (const candidate of candidates) {
      const bucket = normalized.get(candidate.key);
      if (bucket === undefined) {
        normalized.set(candidate.key, { ids: [item.id], basis: candidate.basis });
      } else if (!bucket.ids.includes(item.id)) {
        bucket.ids.push(item.id);
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
        normalizedTokenKeys(token).map((candidate) => candidate.key),
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
      for (const candidate of normalizedTokenKeys(token)) {
        const bucket = normalized.get(candidate.key);
        if (bucket !== undefined) {
          return { vocabularyItemIds: bucket.ids, basis: candidate.basis };
        }
      }
      return null;
    },
  };
}
