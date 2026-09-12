import { describe, expect, it } from 'vitest';
import type { Sentence } from '../reading/text-hierarchy';
import type { TokenAnalysis } from '../reading/token';
import type { Hasher } from '../shared/hashing';
import { paragraphId, readingId, sentenceId } from '../shared/ids';
import {
  createPendingTranslationPlan,
  freezeTranslationPlan,
  selectOpeningSentences,
  selectTranslationCandidates,
  translationPassageWindow,
  validateGlossary,
} from './translation-plan';

const HASHER: Hasher = { algorithm: 'identity', hashText: (text) => text };
const READING = readingId('00000000-0000-4000-8000-000000000001');

function sentence(position: number, paragraph = 0, text = `文${position}。`): Sentence {
  return {
    id: sentenceId(`00000000-0000-4000-8000-${String(position + 10).padStart(12, '0')}`),
    readingId: READING,
    paragraphId: paragraphId(
      `00000000-0000-4000-8000-${String(paragraph + 100).padStart(12, '0')}`,
    ),
    positionInReading: position,
    positionInParagraph: position,
    japaneseText: text,
    contentHash: `hash-${position}`,
  };
}

describe('translation plan', () => {
  it('uses three sentences by default and a three-to-five sentence first paragraph', () => {
    expect(
      selectOpeningSentences(
        [0, 1, 2, 3, 4, 5].map((position) => sentence(position, position < 2 ? 0 : 1)),
      ),
    ).toHaveLength(3);
    expect(
      selectOpeningSentences(
        [0, 1, 2, 3, 4, 5].map((position) => sentence(position, position < 5 ? 0 : 1)),
      ),
    ).toHaveLength(5);
  });

  it('uses every available sentence for a short reading and rejects one oversized sentence', () => {
    expect(selectOpeningSentences([sentence(0), sentence(1)])).toHaveLength(2);
    expect(selectOpeningSentences([sentence(0, 0, '長'.repeat(13_000))])).toEqual([]);
  });

  it('selects late proper nouns and recurring nouns deterministically with bounded examples', () => {
    const sentences = [
      sentence(0, 0, '猫を見る。'),
      sentence(1, 0, '猫と歩く。'),
      sentence(2, 1, '最後に優希が来る。'),
    ];
    const analyses: TokenAnalysis[] = sentences.map((entry, index) => ({
      sentenceId: entry.id,
      analyzerVersion: 'test',
      tokens:
        index === 2
          ? [
              {
                id: 'y',
                startUtf16: 3,
                endUtf16: 5,
                surface: '優希',
                readingHiragana: 'ゆうき',
                partOfSpeech: 'proper-noun',
                dictionaryKeys: [],
                isPunctuation: false,
              },
            ]
          : [
              {
                id: `c${index}`,
                startUtf16: 0,
                endUtf16: 1,
                surface: '猫',
                readingHiragana: 'ねこ',
                partOfSpeech: 'noun',
                dictionaryKeys: [],
                isPunctuation: false,
              },
            ],
    }));
    const selected = selectTranslationCandidates(sentences, analyses);
    expect(selected.map((candidate) => candidate.surfaceJa)).toEqual(['優希', '猫']);
    expect(selected[0].readingHiragana).toBe('ゆうき');
    expect(selected[1].examples).toHaveLength(2);
    expect(selectTranslationCandidates(sentences, [...analyses].reverse())).toEqual(selected);
  });

  it('allows omission and an empty glossary while rejecting invalid entries', () => {
    const candidates = [{ surfaceJa: '優希', kind: 'proper-noun' as const, examples: [] }];
    expect(validateGlossary(candidates, [])).toEqual({ ok: true, value: [] });
    expect(validateGlossary(candidates, [{ surfaceJa: '優希', renderingEn: 'Yuki' }]).ok).toBe(
      true,
    );
    expect(validateGlossary(candidates, [{ surfaceJa: '未知', renderingEn: 'X' }])).toEqual({
      ok: false,
      error: 'invented-surface',
    });
    expect(validateGlossary(candidates, [{ surfaceJa: '優希', renderingEn: ' ' }])).toEqual({
      ok: false,
      error: 'blank-rendering',
    });
    expect(
      validateGlossary(candidates, [
        { surfaceJa: '優希', renderingEn: 'Yuki' },
        { surfaceJa: '優希', renderingEn: 'Yuuki' },
      ]),
    ).toEqual({ ok: false, error: 'duplicate-surface' });
    expect(
      validateGlossary(candidates, [{ surfaceJa: '優希', renderingEn: 'x'.repeat(161) }]),
    ).toEqual({ ok: false, error: 'oversized-rendering' });
  });

  it('separates input identity from creation time and includes frozen terminology in plan identity', () => {
    const sentences = [sentence(0), sentence(1), sentence(2)];
    const input = {
      readingId: READING,
      modelId: 'model',
      promptVersion: 'translation/5',
      title: '題',
      premise: '',
      register: 'written',
      sentences,
      analyses: [],
    };
    const first = createPendingTranslationPlan(HASHER, input, 1);
    const later = createPendingTranslationPlan(HASHER, input, 999);
    expect(first.inputFingerprint).toBe(later.inputFingerprint);
    expect(freezeTranslationPlan(HASHER, first, []).planFingerprint).not.toBe(
      freezeTranslationPlan(HASHER, first, [{ surfaceJa: '優希', renderingEn: 'Yuki' }])
        .planFingerprint,
    );
  });

  it('keeps passage identity stable when a retry target subset changes', () => {
    const sentences = Array.from({ length: 22 }, (_value, position) => sentence(position));
    expect(translationPassageWindow(sentences, 10).map((item) => item.positionInReading)).toEqual(
      translationPassageWindow(sentences, 17).map((item) => item.positionInReading),
    );
  });
});
