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
    expect(storyBlueprintJsonSchema(4)).toMatchObject({
      schema: { properties: { beatsEn: { minItems: 4, maxItems: 4 } } },
    });
    expect(storySegmentJsonSchema(37)).toMatchObject({
      schema: { properties: { sentences: { minItems: 1, maxItems: 37 } } },
    });
    expect(storyRepairPatchJsonSchema(3)).toMatchObject({
      schema: { properties: { replacements: { minItems: 3, maxItems: 3 } } },
    });
  });

  it('puts batch cardinality into review and translation contracts', () => {
    expect(exceptionDecisionsJsonSchema(6)).toMatchObject({
      schema: { properties: { decisions: { minItems: 6, maxItems: 6 } } },
    });
    // The enrichment contracts say their count in words. Strict Structured
    // Outputs rejects `minItems`/`maxItems`, and a rejected `response_format`
    // costs a second full-price request on every batch.
    expect(JSON.stringify(grammarReviewJsonSchema(8))).toContain('At most 8 of them.');
    expect(JSON.stringify(translationsJsonSchema(9))).toContain('exactly 9 of them.');
  });

  it('sends no array bounds in the contracts strict mode refuses', () => {
    for (const contract of [grammarReviewJsonSchema(8), translationsJsonSchema(9)]) {
      expect(JSON.stringify(contract)).not.toMatch(/minItems|maxItems/);
    }
  });
});
