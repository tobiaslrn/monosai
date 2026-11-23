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
  /**
   * Items reachable through allowed normalization only. `following` are the
   * tokens after it in the sentence, which tell a word used as a noun from a
   * verb's stem.
   */
  findNormalized(token: Token, following?: readonly Token[]): NormalizedMatch | null;
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
function withoutKana(text: string): readonly string[] {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code-point iteration is intended
  return [...text.normalize('NFKC')].filter((character) => !isKana(character));
}

/** Whether every character of `part` appears in `whole`, in the same order. */
function isOrderedSubsequence(part: readonly string[], whole: readonly string[]): boolean {
  let next = 0;
  for (const character of whole) {
    if (next < part.length && part[next] === character) {
      next += 1;
    }
  }
  return next === part.length;
}

/**
 * Whether two spellings of one reading name different words.
 *
 * Only when both are written with kanji and, once the kana is set aside,
 * neither one's kanji appear in order within the other's: 紙 is not 神, though
 * both are read かみ, nor 早い 速い. A spelling in kana alone never contradicts
 * one in kanji (ねこ and 猫), and okurigana or a part written in kana does not
 * either (行なう and 行う, 子ども and 子供, ご飯 and 御飯).
 */
export function spellingsContradict(left: string, right: string): boolean {
  if (!containsKanji(left) || !containsKanji(right)) {
    return false;
  }
  const leftKanji = withoutKana(left);
  const rightKanji = withoutKana(right);
  return (
    !isOrderedSubsequence(leftKanji, rightKanji) && !isOrderedSubsequence(rightKanji, leftKanji)
  );
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
 * The irregular verbs whose written kanji changes its reading as the verb
 * inflects (来た, 来ない, 来れば), with the reading of that kanji in the
 * dictionary form. Every other kanji keeps its reading: 食 of 食べた is the 食
 * of 食べる.
 */
const IRREGULAR_KANJI_READINGS: ReadonlyMap<string, string> = new Map([
  ['来', 'く'],
  ['來', 'く'],
  ['為', 'す'],
]);

/**
 * The reading of a token's dictionary form, which the analyzer does not give:
 * the reading of たべ (from たべた) or 食べ is たべ, of their dictionary form
 * たべる. The written form and the dictionary form must share everything but
 * their kana ending, and the reading must end in the written form's ending,
 * which is then swapped for the dictionary form's. The kanji of an irregular
 * verb is read anew as well: 来 of 来た is き, of 来る く. Undefined for a token
 * that is already in its dictionary form, or whose forms do not line up.
 */
function dictionaryFormReading(token: Token): string | undefined {
  const { surface, lemma } = token;
  if (lemma === undefined || lemma.length === 0 || lemma === surface) {
    return undefined;
  }
  const reading = tokenReading(token);
  const surfaceEnding = normalizeLookupKey(trailingKana(surface));
  const lemmaEnding = normalizeLookupKey(trailingKana(lemma));
  const head = surface.slice(0, surface.length - trailingKana(surface).length);
  const sameHead = head === lemma.slice(0, lemma.length - trailingKana(lemma).length);
  if (reading === undefined || !sameHead || !reading.endsWith(surfaceEnding)) {
    return undefined;
  }
  const headReading = reading.slice(0, reading.length - surfaceEnding.length);
  const irregular = IRREGULAR_KANJI_READINGS.get(head.slice(-1));
  if (irregular === undefined) {
    return headReading + lemmaEnding;
  }
  // The same kanji also ends regular verbs (出来る, and 来る read きたる), so
  // only the irregular verb's kanji, a single kana in every form, is read anew,
  // and a verb of no known family is not guessed at.
  switch (token.verbConjugationFamily) {
    case 'irregular':
      return headReading.length === 0
        ? undefined
        : headReading.slice(0, -1) + irregular + lemmaEnding;
    case undefined:
      return undefined;
    default:
      return headReading + lemmaEnding;
  }
}

/** The token's reading in hiragana; a kana spelling is its own reading. */
function tokenReading(token: Token): string | undefined {
  if (token.readingHiragana !== undefined && token.readingHiragana.length > 0) {
    return normalizeLookupKey(token.readingHiragana);
  }
  const surface = token.surface.normalize('NFKC');
  return isKanaOnly(surface) ? normalizeLookupKey(surface) : undefined;
}

/** Word classes that conjugate, whose written form may be a bare stem. */
const CONJUGATING_CLASSES: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'verb',
  'adjective-i',
]);

/**
 * Whether a token is a verb or adjective in a form other than its dictionary
 * form (たべ of たべた, い of いた, 高く), whose own reading is a stem.
 */
export function isInflectedConjugatingWord(
  token: Pick<Token, 'surface' | 'lemma' | 'partOfSpeech'>,
): boolean {
  return (
    token.partOfSpeech !== undefined &&
    CONJUGATING_CLASSES.has(token.partOfSpeech) &&
    token.lemma !== undefined &&
    token.lemma.length > 0 &&
    token.lemma !== token.surface
  );
}

/** The last character of a spelling, as hiragana when it is kana. */
function finalKana(text: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code-point iteration is intended
  const last = [...text.normalize('NFKC')].at(-1);
  return last !== undefined && isKana(last) ? normalizeLookupKey(last) : undefined;
}

/**
 * Whether a card spells the stem a token is written as: the token is a bare
 * continuative stem, which Japanese also uses as a noun (おわり, 申込み), and
 * the card ends in the same kana (終わり, 申し込み). A stem that merely reads
 * like a word spelled otherwise is a different word: い of いた is not 胃, nor
 * き of きた 木.
 */
function spellsStem(token: Token, spelling: string): boolean {
  if (token.inflectionForm !== 'continuative') {
    return false;
  }
  const ending = finalKana(token.surface);
  return ending !== undefined && ending === finalKana(spelling);
}

/** Particles that follow a noun and never a verb's stem or imperative. */
const NOUN_PARTICLES: ReadonlySet<string> = new Set([
  'が',
  'を',
  'に',
  'で',
  'の',
  'へ',
  'から',
  'まで',
  'より',
  'や',
]);

/**
 * Whether a word tagged as an inflected verb is used as a noun: a stem or an
 * imperative followed by a particle that only a noun takes (みせ of みせで as
 * 店, ひ of ひが as 日, いえ of いえに as 家). A stem followed by に and a verb
 * is a purpose instead (かい of かいにいく), and a past or te stem takes で as
 * its te-form (よん of よんで).
 */
function usedAsNoun(token: Token, following: readonly Token[]): boolean {
  if (token.inflectionForm !== 'continuative' && token.inflectionForm !== 'imperative') {
    return false;
  }
  const [next, after] = following;
  if (next?.partOfSpeech !== 'particle' || !NOUN_PARTICLES.has(normalizeLookupKey(next.surface))) {
    return false;
  }
  return !(
    token.inflectionForm === 'continuative' &&
    normalizeLookupKey(next.surface) === 'に' &&
    after?.partOfSpeech === 'verb'
  );
}

interface ReadingKey {
  readonly key: string;
  readonly basis: NormalizedMatchBasis;
  /**
   * Whether the key is a stem's own reading, which only `spellsStem` or
   * `usedAsNoun` admits.
   */
  readonly stem: boolean;
}

/**
 * Readings a token may be matched by, each with the basis it is recorded
 * under: the reading of its dictionary form, which counts as a match of its
 * base form, and its own reading. A verb or adjective that is inflected is
 * matched by the reading of its dictionary form only, or by its own reading
 * where the card spells the same stem (`spellsStem`) or the word is used as a
 * noun (`usedAsNoun`). A function word has none.
 */
function readingKeys(token: Token): readonly ReadingKey[] {
  if (isFunctionWord(token)) {
    return [];
  }
  const own = tokenReading(token);
  const dictionary = dictionaryFormReading(token);
  const stem = isInflectedConjugatingWord(token);
  const keys: ReadingKey[] = [];
  if (dictionary !== undefined && dictionary !== own) {
    keys.push({ key: dictionary, basis: 'lemma', stem: false });
  }
  if (own !== undefined) {
    keys.push({ key: own, basis: 'reading', stem });
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
 * Keys a token is compared with a phrase's words under: its forms and its
 * reading, which can only equal a word the phrase spells in kana at the same
 * place (宜しく in text for よろしく in the phrase). The rest of the phrase
 * vouches for the word, so a function word counts here too (致し for いたし, 達
 * for たち), though never alone.
 */
function phraseKeys(token: Token): readonly string[] {
  const keys = formKeys(token).map((candidate) => candidate.key);
  const reading = tokenReading(token);
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
 * (`spellingsContradict`): ねこ and 猫 are one word, 子ども and 子供 too, 紙 and
 * 神 are not. An inflected verb or adjective is matched by the reading of its
 * dictionary form, not by its stem's (い of いた is not 胃), unless the card
 * spells that stem (`spellsStem`) or the sentence uses the word as a noun
 * (`usedAsNoun`). A function word is never matched by its
 * reading, so the particle は is not 歯.
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
    findNormalized(token, following = []) {
      const noun = usedAsNoun(token, following);
      for (const candidate of formKeys(token)) {
        const bucket = forms.get(candidate.key);
        if (bucket !== undefined) {
          return { vocabularyItemIds: bucket, basis: candidate.basis };
        }
      }
      for (const candidate of readingKeys(token)) {
        const ids = (readings.get(candidate.key) ?? [])
          .filter(
            (entry) =>
              !spellingsContradict(token.surface, entry.spelling) &&
              (!candidate.stem || noun || spellsStem(token, entry.spelling)),
          )
          .map((entry) => entry.id);
        if (ids.length > 0) {
          return { vocabularyItemIds: ids, basis: candidate.basis };
        }
      }
      return null;
    },
  };
}
