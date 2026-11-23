import { describe, expect, it } from 'vitest';
import { analyzeSentence } from '../../../testing/language-runtime';
import { readBundleFile } from '../../../testing/language-runtime';
import { snapshotId, vocabularyItemId } from '../shared/ids';
import type { VocabularyItem } from '../vocabulary/snapshot';
import { classifyAgainstSnapshot, classifyTokens } from './classification';
import {
  compileStructuralBaseline,
  type StructuralBaseline,
  type StructuralBaselineMatcher,
} from './structural-baseline';
import { compileVocabularyMatcher } from './vocabulary-matcher';

const SNAPSHOT = snapshotId('11111111-1111-4111-8111-111111111111');

let cachedBaseline: StructuralBaselineMatcher | null = null;

/** The shipped baseline, so precedence is tested against the real dataset. */
function shippedBaseline(): StructuralBaselineMatcher {
  cachedBaseline ??= compileStructuralBaseline(
    JSON.parse(
      new TextDecoder().decode(readBundleFile('structural-baseline.json')),
    ) as StructuralBaseline,
  );
  return cachedBaseline;
}

let nextId = 0;

async function vocabularyItem(expression: string): Promise<VocabularyItem> {
  nextId += 1;
  // Captured before awaiting: reading the counter afterwards would give every
  // concurrently built item the same identifier.
  const id = vocabularyItemId(`item-${String(nextId)}`);
  const tokens = await analyzeSentence(expression);
  return {
    id,
    snapshotId: SNAPSHOT,
    visibleExpression: expression,
    canonicalExpression: expression,
    expressionHash: `hash-${expression}`,
    analyzedSequence: tokens.map((token) => ({
      surface: token.surface,
      ...(token.lemma === undefined ? {} : { lemma: token.lemma }),
      ...(token.readingHiragana === undefined ? {} : { readingHiragana: token.readingHiragana }),
    })),
  };
}

async function classify(text: string, entries: readonly string[], mode: 'imported' | 'generated') {
  const items = await Promise.all(entries.map(vocabularyItem));
  const tokens = await analyzeSentence(text);
  const statuses = classifyTokens(tokens, {
    mode,
    vocabulary: compileVocabularyMatcher(items),
    baseline: shippedBaseline(),
  });
  return tokens.map((token, index) => ({
    surface: token.surface,
    validation: statuses[index]!.validation,
  }));
}

describe('classification precedence', () => {
  it('marks punctuation before anything else', async () => {
    const result = await classify('猫。', [], 'imported');
    expect(result[1]!.validation.category).toBe('punctuation');
  });

  it('matches an exact reviewed single-token form', async () => {
    const result = await classify('猫が好き', ['猫'], 'imported');
    expect(result[0]!.validation.category).toBe('anki-exact');
  });

  it('matches a reviewed dictionary form used in an inflected surface', async () => {
    const result = await classify('食べました', ['食べる'], 'imported');
    const eat = result[0]!.validation;
    expect(eat.category).toBe('anki-normalized');
    if (eat.category === 'anki-normalized') {
      expect(eat.basis).toBe('lemma');
    }
  });

  it('lets a reviewed multi-token phrase win over its shorter parts', async () => {
    const result = await classify('国際交流基金へ行く', ['国際交流基金', '国際'], 'imported');
    expect(result.slice(0, 3).map((token) => token.validation.category)).toEqual([
      'anki-phrase',
      'anki-phrase',
      'anki-phrase',
    ]);
    const first = result[0]!.validation;
    if (first.category === 'anki-phrase') {
      expect(first.tokenSpan).toEqual({ startTokenIndex: 0, endTokenIndex: 2 });
    }
  });

  it('leaves a semantic synonym unknown', async () => {
    // 車 is reviewed; 自動車 means the same thing and must not be accepted.
    const result = await classify('自動車を買う', ['車'], 'generated');
    expect(result[0]!.validation.category).toBe('unknown');
  });

  it('does not accept a word merely because it shares a kanji', async () => {
    const result = await classify('食堂へ行く', ['食べる'], 'generated');
    expect(result[0]!.validation.category).toBe('unknown');
  });

  it('accepts particles and auxiliaries from the structural baseline', async () => {
    const result = await classify('猫が寝ています', [], 'imported');
    const byCategory = new Map(result.map((token) => [token.surface, token.validation.category]));
    expect(byCategory.get('が')).toBe('structural-baseline');
    expect(byCategory.get('て')).toBe('structural-baseline');
    expect(byCategory.get('い')).toBe('structural-baseline');
    expect(byCategory.get('ます')).toBe('structural-baseline');
  });

  it('recognizes numbers in a date or time as entities', async () => {
    // Counters such as the day and hour markers are structural baseline forms,
    // which outrank entities in the precedence order; the numeral itself is what
    // the entity recognizer claims.
    const date = await classify('3月14日', [], 'imported');
    expect(date.every((token) => token.validation.category !== 'not-in-snapshot')).toBe(true);
    const dateEntity = date[0]!.validation;
    expect(dateEntity.category).toBe('entity');
    if (dateEntity.category === 'entity') {
      expect(dateEntity.entityKind).toBe('date');
    }

    const time = await classify('午後7時', [], 'imported');
    const timeEntity = time[1]!.validation;
    expect(timeEntity.category).toBe('entity');
    if (timeEntity.category === 'entity') {
      expect(timeEntity.entityKind).toBe('time');
    }
  });

  it('treats counters and punctuation around a number as readable', async () => {
    const result = await classify('五冊。', [], 'imported');
    expect(result.map((token) => token.validation.category)).toEqual([
      'entity',
      'structural-baseline',
      'punctuation',
    ]);
  });

  it('recognizes a Japanese name as an entity', async () => {
    const result = await classify('田中さん', [], 'imported');
    const name = result[0]!.validation;
    expect(name.category).toBe('entity');
    if (name.category === 'entity') {
      expect(name.entityKind).toBe('name');
    }
  });

  it('leaves a katakana word outside the snapshot as a candidate', async () => {
    const result = await classify('テーブル', [], 'generated');
    expect(result[0]!.validation.category).toBe('unknown');
  });

  it('reports imported non-matches as not-in-snapshot rather than unknown', async () => {
    const result = await classify('自動車', ['車'], 'imported');
    expect(result[0]!.validation.category).toBe('not-in-snapshot');
  });

  it('records every supporting vocabulary id when a form is ambiguous', async () => {
    const items = await Promise.all([vocabularyItem('橋'), vocabularyItem('箸')]);
    const tokens = await analyzeSentence('はし');
    const statuses = classifyTokens(tokens, {
      mode: 'imported',
      vocabulary: compileVocabularyMatcher(items),
      baseline: shippedBaseline(),
    });
    const validation = statuses[0]!.validation;
    expect(validation.category).toBe('anki-normalized');
    if (validation.category === 'anki-normalized') {
      expect(validation.vocabularyItemIds).toHaveLength(2);
    }
  });
});

describe('matches by reading alone', () => {
  it('does not accept a kanji word because a reviewed word with other kanji reads the same', async () => {
    // 神 (god) is reviewed; 紙 (paper) is also read かみ but is a different word.
    const result = await classify('紙を買う', ['神'], 'generated');
    expect(result[0]!.surface).toBe('紙');
    expect(result[0]!.validation.category).toBe('unknown');
  });

  it('keeps the topic particle structural when a reviewed noun is read は', async () => {
    const result = await classify('猫は寝ている', ['歯'], 'imported');
    expect(result[1]!.surface).toBe('は');
    expect(result[1]!.validation.category).toBe('structural-baseline');
  });

  it('keeps the te-form particle structural when a reviewed noun is read て', async () => {
    const result = await classify('猫は寝ている', ['手'], 'imported');
    expect(result[3]!.surface).toBe('て');
    expect(result[3]!.validation.category).toBe('structural-baseline');
  });

  it('still accepts a kana spelling of a reviewed word, by its reading', async () => {
    const result = await classify('はしを渡る', ['橋'], 'generated');
    expect(result[0]!.validation).toMatchObject({ category: 'anki-normalized', basis: 'reading' });
  });

  it('keeps the particle に structural when a reviewed number is read に', async () => {
    const result = await classify('学校に行く', ['二'], 'generated');
    expect(result[1]!.surface).toBe('に');
    expect(result[1]!.validation.category).toBe('structural-baseline');
  });

  it.each([
    ['猫', 'ねこ'],
    ['猫', 'ネコ'],
    ['ねこ', '猫'],
    ['綺麗', 'きれい'],
    ['美味しい', 'おいしい'],
    ['本', 'ほん'],
    ['手伝う', 'てつだう'],
    ['てつだう', '手伝う'],
    ['お茶', 'おちゃ'],
    ['行なう', '行う'],
    ['子ども', '子供'],
    ['子供', '子ども'],
    ['友だち', '友達'],
    ['友達', '友だち'],
    ['ご飯', '御飯'],
    ['御飯', 'ご飯'],
    ['子どもたち', '子供'],
    ['友だちと', '友達'],
    ['おわり', '終わり'],
    ['申込み', '申し込み'],
  ])('matches %s against the reviewed %s by its reading', async (text, entry) => {
    const result = await classify(text, [entry], 'generated');
    expect(text.startsWith(result[0]!.surface)).toBe(true);
    expect(result[0]!.validation).toMatchObject({ category: 'anki-normalized', basis: 'reading' });
  });

  it.each([
    ['紙', '神'],
    ['神', '紙'],
    ['分かる', '解る'],
    ['解る', '分かる'],
    ['早い', '速い'],
    ['速い', '早い'],
    ['暑い', '熱い'],
    ['熱い', '暑い'],
  ])('does not match %s against the reviewed %s, written with other kanji', async (text, entry) => {
    const result = await classify(text, [entry], 'generated');
    expect(result[0]!.validation.category).toBe('unknown');
  });
});

describe('kana spellings of reviewed inflecting words', () => {
  it.each([
    ['たべた', '食べる'],
    ['わかった', '分かる'],
    ['たかかった', '高い'],
    ['よかった', '良い'],
    ['できた', '出来る'],
  ])('matches %s against the reviewed %s', async (text, entry) => {
    const result = await classify(text, [entry], 'generated');
    expect(result[0]!.validation.category).toBe('anki-normalized');
  });

  it.each([
    ['ご飯をたべた', '食べる', 2],
    ['たべます', '食べる', 0],
    ['もっていく', '持つ', 0],
    ['手伝った', 'てつだう', 0],
    ['食べた', 'たべる', 0],
    ['食べた', '食べる', 0],
    ['行った', '行く', 0],
    ['いきます', '行く', 0],
    ['いた', 'いる', 0],
    ['居た', 'いる', 0],
    ['出来た', 'できる', 0],
  ])(
    'matches the verb of %s against the reviewed %s by its base form',
    async (text, entry, index) => {
      const result = await classify(text, [entry], 'generated');
      expect(result[index]!.validation).toMatchObject({
        category: 'anki-normalized',
        basis: 'lemma',
      });
    },
  );

  it('prefers the reviewed verb to a noun its stem reads like', async () => {
    const result = await classify('いた', ['胃', 'いる'], 'generated');
    expect(result[0]!.validation).toMatchObject({ category: 'anki-normalized', basis: 'lemma' });
  });
});

describe('a kana word tagged as an inflected form', () => {
  it.each([
    ['はやく', 'はやく', '早く'],
    ['早く', '早く', 'はやく'],
    ['すごく', 'すごく', '凄く'],
    ['凄く', '凄く', 'すごく'],
    ['おそくまで', 'おそく', '遅く'],
    ['遅くまで', '遅く', 'おそく'],
    ['良く', '良く', 'よく'],
    ['おおくのひと', 'おおく', '多く'],
    ['みせはどこですか', 'みせ', '店'],
    ['あれはみせです', 'みせ', '店'],
    ['みせもある', 'みせ', '店'],
    ['いけはひろい', 'いけ', '池'],
    ['しろはきれい', 'しろ', '白'],
    ['ここはみせ', 'みせ', '店'],
    ['みせ。', 'みせ', '店'],
    ['きにいった', 'き', '気'],
    ['みせにはいった', 'みせ', '店'],
    ['みせ が ある', 'みせ', '店'],
    ['みせでかった', 'みせ', '店'],
    ['ひがくれた', 'ひ', '日'],
    ['わたしはいえにいます', 'いえ', '家'],
    ['かきをたべた', 'かき', '柿'],
  ])('matches %s, whose %s reads like it, against the reviewed %s', async (text, word, entry) => {
    const result = await classify(text, [entry], 'generated');
    expect(result.find((status) => status.surface === word)?.validation).toMatchObject({
      category: 'anki-normalized',
      basis: 'reading',
    });
  });

  it('a kana verb stem may match a same-reading noun card when no card for the verb exists', async () => {
    // A known gap (arc42 8.1): い of いた is the stem of いる, but the tokens
    // do not tell it from a noun in kana, so with no card for いる it counts as
    // 胃. A card for the verb wins (above).
    const result = await classify('いた', ['胃'], 'generated');
    expect(result[0]!.validation).toMatchObject({ category: 'anki-normalized', basis: 'reading' });
  });
});

describe('the irregular verbs', () => {
  it.each(['来た', '来ない', '来ます', '来れば', '来い', '来よう'])(
    'matches %s against the reviewed くる by its base form',
    async (text) => {
      const result = await classify(text, ['くる'], 'generated');
      expect(result[0]!.validation).toMatchObject({ category: 'anki-normalized', basis: 'lemma' });
    },
  );

  it.each(['きる', '着る', '切る'])(
    'does not match 来た against the reviewed %s',
    async (entry) => {
      const result = await classify('来た', [entry], 'generated');
      expect(result[0]!.validation.category).toBe('unknown');
    },
  );

  it.each(['した', 'しない', 'すれば', 'させる'])(
    'matches %s against the reviewed する by its base form',
    async (text) => {
      const result = await classify(text, ['する'], 'generated');
      expect(result[0]!.validation).toMatchObject({ category: 'anki-normalized', basis: 'lemma' });
    },
  );
});

describe('function words', () => {
  it('does not match 下さい alone against the reviewed ください', async () => {
    const result = await classify('下さい', ['ください'], 'generated');
    expect(result[0]!.validation.category).toBe('unknown');
  });

  it.each([
    ['宜しくお願い致します', 'よろしくお願いいたします'],
    ['私達', '私たち'],
  ])('matches %s as the reviewed phrase %s', async (text, entry) => {
    const result = await classify(text, [entry], 'generated');
    expect(result.map((token) => token.validation.category)).toEqual(
      result.map(() => 'anki-phrase'),
    );
  });
});

describe('classifyAgainstSnapshot', () => {
  it('reports that vocabulary is not configured instead of marking everything unknown', async () => {
    const tokens = await analyzeSentence('猫が寝る');
    expect(classifyAgainstSnapshot(tokens, null)).toEqual({ kind: 'vocabulary-not-configured' });
  });

  it('classifies when a snapshot is available', async () => {
    const tokens = await analyzeSentence('猫');
    const outcome = classifyAgainstSnapshot(tokens, {
      mode: 'imported',
      vocabulary: compileVocabularyMatcher([await vocabularyItem('猫')]),
      baseline: shippedBaseline(),
    });
    expect(outcome.kind).toBe('classified');
    if (outcome.kind === 'classified') {
      expect(outcome.statuses[0]!.validation.category).toBe('anki-exact');
    }
  });
});
