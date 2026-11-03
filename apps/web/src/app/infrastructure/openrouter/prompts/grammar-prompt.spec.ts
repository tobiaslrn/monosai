import { describe, expect, it } from 'vitest';
import type { GrammarReviewRequest } from '../../../domain/ai/grammar-review-request';
import { sentenceId } from '../../../domain/shared/ids';
import { buildGrammarPrompt } from './grammar-prompt';

const REQUEST: GrammarReviewRequest = {
  profileGuidance: 'Target ceiling: short clauses and basic connective forms.',
  registerPreference: 'polite',
  sentences: [
    { id: sentenceId('real-sentence-a'), textJa: '雨が降っています。' },
    { id: sentenceId('real-sentence-b'), textJa: '家に帰らなければなりません。' },
  ],
  promptVersion: 'grammar/5',
};

describe('buildGrammarPrompt', () => {
  it('uses ordinal sentence ids and keeps real domain ids off the wire', () => {
    const prompt = buildGrammarPrompt(REQUEST);

    expect(prompt.user).toContain('# Grammar profile');
    expect(prompt.user).toContain('Register: polite');
    expect(prompt.user).toContain('[0] 雨が降っています。');
    expect(prompt.user).toContain('[1] 家に帰らなければなりません。');
    expect(prompt.user).not.toContain('real-sentence-a');
    expect(prompt.user).not.toContain('real-sentence-b');
    expect(prompt.jsonContract).toContain('sentenceId');
  });

  it('escapes a multiline sentence as one physical wire line', () => {
    const prompt = buildGrammarPrompt({
      ...REQUEST,
      sentences: [{ id: sentenceId('real-sentence-a'), textJa: '雨が\n降っています。' }],
    });

    expect(prompt.user).toContain('[0] 雨が\\n降っています。');
    expect(prompt.user).not.toContain('雨が\n降っています。');
  });
});
