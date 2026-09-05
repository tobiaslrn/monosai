import { describe, expect, it } from 'vitest';
import { sentenceId } from '../shared/ids';
import { isErr, isOk } from '../shared/result';
import { MAX_TRANSLATION_BATCH, matchTranslations, planBatches } from './translation-request';

describe('planBatches', () => {
  it('produces no batches for an empty input', () => {
    expect(planBatches([])).toEqual([]);
  });

  it('keeps a single item in one batch', () => {
    expect(planBatches([1])).toEqual([[1]]);
  });

  it('chunks into batches of exactly the maximum size', () => {
    const items = Array.from({ length: MAX_TRANSLATION_BATCH * 2 }, (_, index) => index);

    const batches = planBatches(items);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(MAX_TRANSLATION_BATCH);
    expect(batches[1]).toHaveLength(MAX_TRANSLATION_BATCH);
  });

  it('leaves a smaller remainder as the last batch, preserving order', () => {
    const items = Array.from({ length: MAX_TRANSLATION_BATCH + 3 }, (_, index) => index);

    const batches = planBatches(items);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toEqual(items.slice(0, MAX_TRANSLATION_BATCH));
    expect(batches[1]).toEqual(items.slice(MAX_TRANSLATION_BATCH));
  });

  it('honours an override maximum', () => {
    expect(planBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('matchTranslations', () => {
  const requested = [
    { id: sentenceId('s1'), textJa: '一つ目。' },
    { id: sentenceId('s2'), textJa: '二つ目。' },
  ];

  it('succeeds and preserves requested order', () => {
    const returned = [
      { id: sentenceId('s2'), textEn: 'Second.' },
      { id: sentenceId('s1'), textEn: 'First.' },
    ];

    const result = matchTranslations(requested, returned);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((entry) => entry.id)).toEqual([sentenceId('s1'), sentenceId('s2')]);
    }
  });

  it('rejects a returned id that was not requested', () => {
    const returned = [
      { id: sentenceId('s1'), textEn: 'First.' },
      { id: sentenceId('s2'), textEn: 'Second.' },
      { id: sentenceId('s3'), textEn: 'Extra.' },
    ];

    const result = matchTranslations(requested, returned);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe('extra');
    }
  });

  it('rejects when a requested id is missing from the response', () => {
    const returned = [{ id: sentenceId('s1'), textEn: 'First.' }];

    const result = matchTranslations(requested, returned);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe('missing');
    }
  });

  it('rejects a duplicate id in the response', () => {
    const returned = [
      { id: sentenceId('s1'), textEn: 'First.' },
      { id: sentenceId('s1'), textEn: 'First again.' },
    ];

    const result = matchTranslations(requested, returned);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe('duplicate');
    }
  });

  it('rejects a blank translation', () => {
    const returned = [
      { id: sentenceId('s1'), textEn: '   ' },
      { id: sentenceId('s2'), textEn: 'Second.' },
    ];

    const result = matchTranslations(requested, returned);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe('blank');
    }
  });
});
