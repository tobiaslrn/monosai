import { describe, expect, it } from 'vitest';
import { sentenceId } from '../shared/ids';
import {
  GRAMMAR_REVIEW_INPUT_BUDGET_TOKENS,
  MAX_GRAMMAR_REVIEW_BATCH,
  planGrammarBatches,
} from './grammar-review-request';

function sentences(count: number, text = '文。') {
  return Array.from({ length: count }, (_value, index) => ({
    id: sentenceId(`s${String(index)}`),
    text,
  }));
}

describe('planGrammarBatches', () => {
  it('keeps an ordinary short story in one request', () => {
    const planned = planGrammarBatches(
      sentences(15),
      'beginner guidance',
      'either',
      (item) => item.text,
    );

    expect(planned).toHaveLength(1);
    expect(planned[0]).toHaveLength(15);
  });

  it('splits long readings at the sentence ceiling without changing order', () => {
    const list = sentences(MAX_GRAMMAR_REVIEW_BATCH + 2);
    const planned = planGrammarBatches(list, 'guidance', 'either', (item) => item.text);

    expect(planned.map((batch) => batch.length)).toEqual([MAX_GRAMMAR_REVIEW_BATCH, 2]);
    expect(planned.flat()).toEqual(list);
  });

  it('uses the input budget and still emits one oversized sentence', () => {
    const text = '日'.repeat(GRAMMAR_REVIEW_INPUT_BUDGET_TOKENS);
    const list = sentences(2, text);
    const planned = planGrammarBatches(list, 'guidance', 'either', (item) => item.text);

    expect(planned.map((batch) => batch.length)).toEqual([1, 1]);
  });
});
