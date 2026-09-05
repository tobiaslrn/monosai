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
    validation: statuses[index].validation,
  }));
}

describe('classification precedence', () => {
  it('marks punctuation before anything else', async () => {
    const result = await classify('猫。', [], 'imported');
    expect(result[1].validation.category).toBe('punctuation');
  });

  it('matches an exact reviewed single-token form', async () => {
    const result = await classify('猫が好き', ['猫'], 'imported');
    expect(result[0].validation.category).toBe('anki-exact');
  });

  it('matches a reviewed dictionary form used in an inflected surface', async () => {
    const result = await classify('食べました', ['食べる'], 'imported');
    const eat = result[0].validation;
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
    const first = result[0].validation;
    if (first.category === 'anki-phrase') {
      expect(first.tokenSpan).toEqual({ startTokenIndex: 0, endTokenIndex: 2 });
    }
  });

  it('leaves a semantic synonym unknown', async () => {
    // 車 is reviewed; 自動車 means the same thing and must not be accepted.
    const result = await classify('自動車を買う', ['車'], 'generated');
    expect(result[0].validation.category).toBe('unknown');
  });

  it('does not accept a word merely because it shares a kanji', async () => {
    const result = await classify('食堂へ行く', ['食べる'], 'generated');
    expect(result[0].validation.category).toBe('unknown');
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
    const dateEntity = date[0].validation;
    expect(dateEntity.category).toBe('entity');
    if (dateEntity.category === 'entity') {
      expect(dateEntity.entityKind).toBe('date');
    }

    const time = await classify('午後7時', [], 'imported');
    const timeEntity = time[1].validation;
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
    const name = result[0].validation;
    expect(name.category).toBe('entity');
    if (name.category === 'entity') {
      expect(name.entityKind).toBe('name');
    }
  });

  it('leaves a katakana word outside the snapshot as a candidate', async () => {
    const result = await classify('テーブル', [], 'generated');
    expect(result[0].validation.category).toBe('unknown');
  });

  it('reports imported non-matches as not-in-snapshot rather than unknown', async () => {
    const result = await classify('自動車', ['車'], 'imported');
    expect(result[0].validation.category).toBe('not-in-snapshot');
  });

  it('records every supporting vocabulary id when a form is ambiguous', async () => {
    const items = await Promise.all([vocabularyItem('橋'), vocabularyItem('箸')]);
    const tokens = await analyzeSentence('はし');
    const statuses = classifyTokens(tokens, {
      mode: 'imported',
      vocabulary: compileVocabularyMatcher(items),
      baseline: shippedBaseline(),
    });
    const validation = statuses[0].validation;
    expect(validation.category).toBe('anki-normalized');
    if (validation.category === 'anki-normalized') {
      expect(validation.vocabularyItemIds).toHaveLength(2);
    }
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
      expect(outcome.statuses[0].validation.category).toBe('anki-exact');
    }
  });
});
