import { describe, expect, it } from 'vitest';
import {
  exceptionDecisionsJsonSchema,
  grammarReviewJsonSchema,
  storyBlueprintJsonSchema,
  storyCandidateJsonSchema,
  storyRepairPatchJsonSchema,
  storySegmentJsonSchema,
  translationsJsonSchema,
} from './openrouter-response.schema';

describe('request-specific provider JSON schemas', () => {
  it('accepts undershoot while keeping requested upper bounds', () => {
    expect(storyCandidateJsonSchema(7)).toMatchObject({
      schema: { properties: { sentences: { minItems: 1, maxItems: 7 } } },
    });
    expect(storySegmentJsonSchema(37)).toMatchObject({
      schema: { properties: { sentences: { minItems: 1, maxItems: 37 } } },
    });
  });

  it('states exact counts in words in review, plan, and translation contracts', () => {
    expect(JSON.stringify(exceptionDecisionsJsonSchema(6))).toContain('exactly 6 of them.');
    expect(JSON.stringify(storyBlueprintJsonSchema(4))).toContain('exactly 4 of them.');
    // The enrichment contracts say their count in words. Strict Structured
    // Outputs rejects `minItems`/`maxItems`, and a rejected `response_format`
    // costs a second full-price request on every batch.
    expect(JSON.stringify(grammarReviewJsonSchema(8))).toContain('At most 8 of them.');
    expect(JSON.stringify(translationsJsonSchema(9))).toContain('exactly 9 of them.');
  });

  it('sends no array bounds in the contracts strict mode refuses', () => {
    for (const contract of [
      grammarReviewJsonSchema(8),
      translationsJsonSchema(9),
      exceptionDecisionsJsonSchema(6),
      storyBlueprintJsonSchema(4),
      storyRepairPatchJsonSchema(),
    ]) {
      expect(JSON.stringify(contract)).not.toMatch(/minItems|maxItems/);
    }
  });
});
