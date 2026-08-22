import { describe, expect, it } from 'vitest';
import { formatVocabularyState } from './learning-data-section.component';

describe('formatVocabularyState', () => {
  it('distinguishes an empty setup from a missing live connection', () => {
    expect(formatVocabularyState(null)).toBe('No vocabulary snapshot yet');
  });

  it('names an Anki package without claiming that AnkiConnect is connected', () => {
    expect(formatVocabularyState({ uniqueEntryCount: 1_240, sourceKinds: ['anki-package'] })).toBe(
      '1,240 unique expressions · Anki package',
    );
  });

  it('collapses the two AnkiConnect provider variants into one source label', () => {
    expect(
      formatVocabularyState({
        uniqueEntryCount: 50,
        sourceKinds: ['anki-connect'],
      }),
    ).toBe('50 unique expressions · AnkiConnect');
  });
});
