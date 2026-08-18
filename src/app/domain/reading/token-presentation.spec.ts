import { describe, expect, it } from 'vitest';
import type { StructuralBaselineEntry } from '../language/structural-baseline';
import { presentStatus } from './token-presentation';
import type { TokenValidation } from './validation';

const BASELINE_STATUS: TokenValidation = {
  category: 'structural-baseline',
  ruleId: 'sb-particle-wa',
};

function entry(overrides: Partial<StructuralBaselineEntry> = {}): StructuralBaselineEntry {
  return {
    id: 'sb-particle-wa',
    category: 'particle',
    forms: ['は'],
    partsOfSpeech: ['particle'],
    nameEn: 'は (topic marker)',
    descriptionEn: 'Marks the topic of the sentence.',
    exampleJa: '私は学生です。',
    ...overrides,
  };
}

describe('presentStatus', () => {
  it('names the matched form when the baseline entry resolves', () => {
    const presentation = presentStatus(BASELINE_STATUS, entry());

    expect(presentation.structuralForm).toEqual({
      nameEn: 'は (topic marker)',
      descriptionEn: 'Marks the topic of the sentence.',
      exampleJa: '私は学生です。',
    });
  });

  it('keeps the category label and explanation alongside the named form', () => {
    // The badge and the marker are the status vocabulary shared with every other
    // category; naming the form adds to them rather than replacing them.
    const generic = presentStatus(BASELINE_STATUS);
    const named = presentStatus(BASELINE_STATUS, entry());

    expect(named.label).toBe(generic.label);
    expect(named.marker).toBe(generic.marker);
    expect(named.explanation).toBe(generic.explanation);
  });

  it('omits the example when the entry ships none', () => {
    const withoutExample = entry();
    const presentation = presentStatus(BASELINE_STATUS, {
      ...withoutExample,
      exampleJa: undefined,
    });

    expect(presentation.structuralForm).toEqual({
      nameEn: withoutExample.nameEn,
      descriptionEn: withoutExample.descriptionEn,
    });
    expect(presentation.structuralForm).not.toHaveProperty('exampleJa');
  });

  it('falls back to the generic explanation when the id cannot be resolved', () => {
    // An analysis stored under an older bundle can carry an id the current
    // baseline no longer defines; that must read as grammar, not as an error.
    for (const unresolved of [undefined, null]) {
      const presentation = presentStatus(BASELINE_STATUS, unresolved);

      expect(presentation.structuralForm).toBeUndefined();
      expect(presentation.explanation).toContain('sentence-building grammar');
    }
  });

  it('never attaches a form to a status that is not a baseline match', () => {
    const statuses: readonly TokenValidation[] = [
      { category: 'anki-exact', vocabularyItemIds: [] },
      { category: 'not-in-snapshot' },
      { category: 'unknown', reason: 'not-in-vocabulary' },
      { category: 'punctuation' },
    ];

    for (const status of statuses) {
      expect(presentStatus(status, entry()).structuralForm, status.category).toBeUndefined();
    }
  });
});
