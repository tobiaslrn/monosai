import type { VocabularyItemId } from '../shared/ids';
import type { PartOfSpeech, Token } from '../reading/token';
import type { VocabularyItem } from '../vocabulary/snapshot';
import { containsKanji, isHiragana, isKanaOnly, isKatakana, normalizeLookupKey } from './kana';

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

/** Whether a token is grammar that only its written form may match (は, て, に). */
export function isFunctionWord(token: Pick<Token, 'partOfSpeech'>): boolean {
  return token.partOfSpeech !== undefined && FUNCTION_WORD_CLASSES.has(token.partOfSpeech);
}

function isKana(character: string): boolean {
  return isHiragana(character) || isKatakana(character) || character === 'ー';
}

/** A spelling with all kana removed: 行なう and 行う both give 行. */
function withoutKana(text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code-point iteration is intended
  return [...text.normalize('NFKC')].filter((character) => !isKana(character)).join('');
}

/**
 * Whether two spellings of one reading name different words.
 *
 * Only when both are written with kanji and their kanji differ once the kana is
 * set aside: 紙 is not 神, though both are read かみ. A spelling in kana alone
 * never contradicts one in kanji (ねこ and 猫), and okurigana or a kana part
 * does not either (行なう and 行う, お茶 and おちゃ).
 */
export function spellingsContradict(left: string, right: string): boolean {
  return containsKanji(left) && containsKanji(right) && withoutKana(left) !== withoutKana(right);
}

/** The kana a spelling ends in: べる of 食べる, all of たべる. */
function trailingKana(text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code-point iteration is intended
  const characters = [...text];
  let start = characters.length;
  while (start > 0 && isKana(characters[start - 1] ?? '')) {
    start -= 1;
  }
  return characters.slice(start).join('');
}

/**
 * The reading of a token's dictionary form, which the analyzer does not give:
 * the reading of たべ (from たべた) or 食べ is たべ, of their dictionary form
 * たべる. The written form and the dictionary form must share everything but
 * their kana ending, and the reading must end in the written form's ending,
 * which is then swapped for the dictionary form's. Undefined for a token that
 * is already in its dictionary form, or whose forms do not line up.
 */
function dictionaryFormReading(token: Token): string | undefined {
  const { surface, lemma } = token;
  if (lemma === undefined || lemma.length === 0 || lemma === surface) {
    return undefined;
  }
  const reading = tokenReading(token);
  const surfaceEnding = normalizeLookupKey(trailingKana(surface));
  const lemmaEnding = normalizeLookupKey(trailingKana(lemma));
  const sameHead =
    surface.slice(0, surface.length - trailingKana(surface).length) ===
    lemma.slice(0, lemma.length - trailingKana(lemma).length);
  if (reading === undefined || !sameHead || !reading.endsWith(surfaceEnding)) {
    return undefined;
  }
  return reading.slice(0, reading.length - surfaceEnding.length) + lemmaEnding;
}

/** The token's reading in hiragana; a kana spelling is its own reading. */
function tokenReading(token: Token): string | undefined {
  if (token.readingHiragana !== undefined && token.readingHiragana.length > 0) {
    return normalizeLookupKey(token.readingHiragana);
  }
  const surface = token.surface.normalize('NFKC');
  return isKanaOnly(surface) ? normalizeLookupKey(surface) : undefined;
}

/**
 * Readings a token may be matched by, each with the basis it is recorded
 * under: its own reading, and the reading of its dictionary form, which counts
 * as a match of its base form. An inflected token is looked up by its
 * dictionary form first, since a stem such as い (from いた) can read like an
 * unrelated noun. A function word has none.
 */
function readingKeys(
  token: Token,
): readonly { readonly key: string; readonly basis: NormalizedMatchBasis }[] {
  if (isFunctionWord(token)) {
    return [];
  }
  const own = tokenReading(token);
  const dictionary = dictionaryFormReading(token);
  const keys: { key: string; basis: NormalizedMatchBasis }[] = [];
  if (dictionary !== undefined && dictionary !== own) {
    keys.push({ key: dictionary, basis: 'lemma' });
  }
  if (own !== undefined) {
    keys.push({ key: own, basis: 'reading' });
  }
  return keys;
}

/**
 * Keys a running-text token is compared with item forms under: its written
 * form and its base form.
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
 * Keys a token is compared with a phrase's words under: its forms and, for a
 * content word, its reading, which can only equal a word the phrase spells in
 * kana (宜しく in text for よろしく in the phrase).
 */
function phraseKeys(token: Token): readonly string[] {
  const keys = formKeys(token).map((candidate) => candidate.key);
  const reading = isFunctionWord(token) ? undefined : tokenReading(token);
  return reading === undefined ? keys : [...keys, reading];
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
 * forms are looked up among the forms. Failing that, its reading and its
 * dictionary form's reading are looked up among the readings, and an entry
 * found there counts only when the two spellings do not contradict each other
 * (`spellingsContradict`): ねこ and 猫 are one word, 紙 and 神 are not. A
 * function word is never matched by its reading, so the particle は is not 歯.
 * Nothing here accepts synonyms, edit distance, or shared kanji as evidence of
 * known vocabulary.
 */
export function compileVocabularyMatcher(items: readonly VocabularyItem[]): VocabularyMatcher {
  const exact = new Map<string, VocabularyItemId[]>();
  const forms = new Map<string, VocabularyItemId[]>();
  const readings = new Map<string, { id: VocabularyItemId; spelling: string }[]>();
  const addReading = (key: string, item: VocabularyItem): void => {
    const bucket = readings.get(key);
    if (bucket === undefined) {
      readings.set(key, [{ id: item.id, spelling: item.canonicalExpression }]);
    } else if (!bucket.some((entry) => entry.id === item.id)) {
      bucket.push({ id: item.id, spelling: item.canonicalExpression });
    }
  };
  const exactPhrases = newNode();
  const normalizedPhrases = newNode();

  for (const item of items) {
    const sequence = item.analyzedSequence;

    // The whole expression is always a single-token key as well: an entry
    // analyzed alone as several tokens (十分 as 十 + 分) can be one token in
    // running text (これで十分です), and its literal form is still exact evidence.
    addToBucket(exact, item.canonicalExpression, item.id);
    addToBucket(forms, normalizeLookupKey(item.canonicalExpression), item.id);
    // An entry written in kana is its own reading, however it was analyzed
    // (おちゃ as お + ちゃ still reads おちゃ, like お茶).
    if (isKanaOnly(item.canonicalExpression.normalize('NFKC'))) {
      addReading(normalizeLookupKey(item.canonicalExpression), item);
    }

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
        addReading(normalizeLookupKey(token.readingHiragana), item);
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
      const normalizedHit = longestMatch(normalizedPhrases, tokens, startIndex, phraseKeys);
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
      for (const candidate of readingKeys(token)) {
        const ids = (readings.get(candidate.key) ?? [])
          .filter((entry) => !spellingsContradict(token.surface, entry.spelling))
          .map((entry) => entry.id);
        if (ids.length > 0) {
          return { vocabularyItemIds: ids, basis: candidate.basis };
        }
      }
      return null;
    },
  };
}
