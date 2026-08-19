import { describe, expect, it } from 'vitest';
import {
  MAX_PREMISE_LENGTH,
  MAX_SPECIAL_INSTRUCTIONS_LENGTH,
  SENTENCE_RANGES,
  countCodePoints,
  validateStoryInput,
} from './story-request';

describe('SENTENCE_RANGES', () => {
  it('uses the ranges the specification states', () => {
    expect(SENTENCE_RANGES.micro).toEqual({ min: 4, max: 6 });
    expect(SENTENCE_RANGES.short).toEqual({ min: 13, max: 20 });
  });
});

describe('validateStoryInput', () => {
  it('accepts a premise and trims the learner formatting around it', () => {
    const result = validateStoryInput({ premise: '  猫が旅に出る話。  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.premise).toBe('猫が旅に出る話。');
    expect('specialInstructions' in result.value).toBe(false);
  });

  it('drops special instructions that are only whitespace', () => {
    const result = validateStoryInput({ premise: 'a premise', specialInstructions: '   ' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect('specialInstructions' in result.value).toBe(false);
  });

  it('rejects a premise that is empty once trimmed', () => {
    const result = validateStoryInput({ premise: '\n  \t ' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.map((issue) => issue.code)).toEqual(['premise-empty']);
  });

  it('measures the limit in characters, so a surrogate pair counts once', () => {
    // 1,000 astral-plane characters are 2,000 UTF-16 units but 1,000 characters.
    const premise = '\u{20B9F}'.repeat(MAX_PREMISE_LENGTH);

    expect(premise.length).toBe(MAX_PREMISE_LENGTH * 2);
    expect(countCodePoints(premise)).toBe(MAX_PREMISE_LENGTH);
    expect(validateStoryInput({ premise }).ok).toBe(true);
  });

  it('rejects a premise one character past the limit', () => {
    const result = validateStoryInput({ premise: 'あ'.repeat(MAX_PREMISE_LENGTH + 1) });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error[0].code).toBe('premise-too-long');
  });

  it('reports every failing field at once rather than one at a time', () => {
    const result = validateStoryInput({
      premise: '',
      specialInstructions: 'x'.repeat(MAX_SPECIAL_INSTRUCTIONS_LENGTH + 1),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.map((issue) => issue.field)).toEqual(['premise', 'specialInstructions']);
  });
});
