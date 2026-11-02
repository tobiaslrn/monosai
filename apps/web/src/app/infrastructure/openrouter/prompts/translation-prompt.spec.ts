import { describe, expect, it } from 'vitest';
import type { TranslationBatchRequest } from '../../../domain/ai/translation-request';
import { sentenceId } from '../../../domain/shared/ids';
import { buildTranslationPrompt } from './translation-prompt';

const REQUEST: TranslationBatchRequest = {
  kind: 'tail',
  window: [
    { targetId: null, textJa: '前の日は雨でした。', textEn: 'It rained the previous day.' },
    { targetId: sentenceId('sentence-1'), textJa: '優希は駅で待っていました。' },
  ],
  titleJa: 'ミケの一日',
  premiseJa: 'ミケが町を歩く話。',
  registerPreference: 'polite',
  frozenGlossary: [{ surfaceJa: '優希', renderingEn: 'Yuki' }],
  establishedRenderings: [
    {
      surfaceJa: '優希',
      exampleJa: '優希は駅にいました。',
      exampleEn: 'Yuki was at the station.',
    },
  ],
  glossaryCandidates: [
    {
      surfaceJa: '青い塔',
      readingHiragana: 'あおいとう',
      kind: 'recurring-term',
      examples: [{ sentenceId: sentenceId('example-1'), textJa: '遠くに青い塔が見えました。' }],
    },
  ],
  openingTranslations: [{ textJa: '優希は駅にいました。', textEn: 'Yuki was at the station.' }],
  promptVersion: 'translation/5',
};

describe('buildTranslationPrompt', () => {
  it('places stable context before the changing reading window', () => {
    const prompt = buildTranslationPrompt(REQUEST);
    const user = prompt.user;

    expect(user.indexOf('translation settings')).toBeLessThan(user.indexOf('story premise'));
    expect(user.indexOf('story premise')).toBeLessThan(user.indexOf('frozen glossary'));
    expect(user.indexOf('frozen glossary')).toBeLessThan(user.indexOf('established renderings'));
    expect(user.indexOf('established renderings')).toBeLessThan(
      user.indexOf('glossary candidates'),
    );
    expect(user.indexOf('glossary candidates')).toBeLessThan(
      user.indexOf('saved opening translations'),
    );
    expect(user.indexOf('saved opening translations')).toBeLessThan(user.indexOf('reading window'));
    expect(user).toContain('[0] CONTEXT: 前の日は雨でした。');
    expect(user).toContain('English: It rained the previous day.');
    expect(user).toContain('[1] TARGET: 優希は駅で待っていました。');
    expect(user).not.toContain('targetIds');
    expect(user).not.toContain('example-1');
    expect(prompt.jsonContract).toContain('"translations"');
  });

  it('omits optional empty sections', () => {
    const prompt = buildTranslationPrompt({
      kind: 'tail',
      window: [{ targetId: null, textJa: '雨です。' }],
      frozenGlossary: [],
      establishedRenderings: [],
      glossaryCandidates: [],
      openingTranslations: [],
      premiseJa: '',
      promptVersion: 'translation/5',
    });

    expect(prompt.user).not.toContain('Frozen glossary');
    expect(prompt.user).not.toContain('Established renderings');
    expect(prompt.user).not.toContain('Glossary candidates');
    expect(prompt.user).not.toContain('Saved opening translations');
    expect(prompt.user).not.toContain('Story premise');
  });

  it('uses a glossary-only fallback contract for glossary repair', () => {
    const prompt = buildTranslationPrompt({
      ...REQUEST,
      kind: 'glossary-repair',
    });

    expect(prompt.jsonContract).toContain('"glossary"');
    expect(prompt.jsonContract).not.toContain('"translations"');
    expect(prompt.system).toContain('For a glossary-repair request, return no translations');
  });
});
