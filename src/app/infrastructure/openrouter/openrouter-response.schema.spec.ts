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
  it('puts exact story and segment counts into the array contracts', () => {
    expect(storyCandidateJsonSchema({ min: 7, max: 7 })).toMatchObject({
      schema: { properties: { sentences: { minItems: 7, maxItems: 7 } } },
    });
    expect(storyBlueprintJsonSchema(4)).toMatchObject({
      schema: { properties: { segments: { minItems: 4, maxItems: 4 } } },
    });
    expect(storySegmentJsonSchema(37)).toMatchObject({
      schema: { properties: { sentences: { minItems: 37, maxItems: 37 } } },
    });
    expect(storyRepairPatchJsonSchema(3)).toMatchObject({
      schema: { properties: { replacements: { minItems: 3, maxItems: 3 } } },
    });
  });

  it('puts batch cardinality into review and translation contracts', () => {
    expect(exceptionDecisionsJsonSchema(6)).toMatchObject({
      schema: { properties: { decisions: { minItems: 6, maxItems: 6 } } },
    });
    expect(grammarReviewJsonSchema(8)).toMatchObject({
      schema: { properties: { findings: { maxItems: 24 } } },
    });
    expect(translationsJsonSchema(9)).toMatchObject({
      schema: { properties: { translations: { minItems: 9, maxItems: 9 } } },
    });
  });
});
